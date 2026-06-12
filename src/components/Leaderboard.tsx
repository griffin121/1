import { useEffect, useState } from 'react';
import { polymarketService, PolymarketMatch } from '../lib/polymarketApi';
import { buildOwnerLookup, normalizeTeamName } from '../lib/owners';

interface TeamEntry {
  teamName: string;
  groupName: string | null;
  rank: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsDiff: number;
  groupPoints: number;
  knockoutPoints: number;
  totalPoints: number;
}

interface OwnerEntry {
  owner: string;
  totalPoints: number;
  teams: TeamEntry[];
}

interface GroupTeamRow {
  teamName: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsDiff: number;
  points: number;
  owner: string | null;
}

interface GroupSummary {
  groupName: string;
  teams: GroupTeamRow[];
}

interface FixtureEntry {
  date: string;
  round: string;
  home: string;
  away: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  status: string;
}

interface LeaderboardData {
  updatedAt: string;
  currentRound: string | null;
  leaderboard: OwnerEntry[];
  groups: GroupSummary[];
  recentResults: FixtureEntry[];
  upcomingFixtures: FixtureEntry[];
  error?: string;
}

const OWNER_ORDER = ['Tim', 'James', 'Griffin'];

function formatPoints(n: number): string {
  // Show up to 2 decimals, trimming trailing zeros, but keep at least 1 digit
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function formatFixtureDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

// Process matches into leaderboard data
function processMatches(matches: PolymarketMatch[]): LeaderboardData {
  const ownerLookup = buildOwnerLookup();
  const leaderboardMap: Record<string, OwnerEntry> = {
    Tim: { owner: 'Tim', totalPoints: 0, teams: [] },
    James: { owner: 'James', totalPoints: 0, teams: [] },
    Griffin: { owner: 'Griffin', totalPoints: 0, teams: [] }
  };

  const groupsMap: Record<string, GroupTeamRow[]> = {};
  const recentResults: FixtureEntry[] = [];
  const upcomingFixtures: FixtureEntry[] = [];

  matches.forEach(match => {
    const normalizedHome = normalizeTeamName(match.homeTeam);
    const normalizedAway = normalizeTeamName(match.awayTeam);
    const homeOwner = ownerLookup[normalizedHome];
    const awayOwner = ownerLookup[normalizedAway];

    const fixture: FixtureEntry = {
      date: match.startTime,
      round: match.round || 'Group Stage',
      home: match.homeTeam,
      away: match.awayTeam,
      homeGoals: match.homeScore,
      awayGoals: match.awayScore,
      status: match.status
    };

    // Categorize fixtures
    if (match.status === 'completed' || match.status === 'live') {
      recentResults.push(fixture);
    } else {
      upcomingFixtures.push(fixture);
    }

    // Update group stage data if applicable
    if (match.group) {
      if (!groupsMap[match.group]) {
        groupsMap[match.group] = [];
      }

      const homeTeamExists = groupsMap[match.group].some(t => t.teamName === match.homeTeam);
      if (!homeTeamExists) {
        groupsMap[match.group].push({
          teamName: match.homeTeam,
          rank: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsDiff: 0,
          points: 0,
          owner: homeOwner || null
        });
      }

      const awayTeamExists = groupsMap[match.group].some(t => t.teamName === match.awayTeam);
      if (!awayTeamExists) {
        groupsMap[match.group].push({
          teamName: match.awayTeam,
          rank: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsDiff: 0,
          points: 0,
          owner: awayOwner || null
        });
      }
    }

    // Calculate points for owners
    if (match.status === 'completed') {
      let homePoints = 0;
      let awayPoints = 0;

      if (match.homeScore > match.awayScore) {
        homePoints = 3;
      } else if (match.awayScore > match.homeScore) {
        awayPoints = 3;
      } else {
        homePoints = 1;
        awayPoints = 1;
      }

      if (homeOwner && leaderboardMap[homeOwner]) {
        leaderboardMap[homeOwner].totalPoints += homePoints;
      }
      if (awayOwner && leaderboardMap[awayOwner]) {
        leaderboardMap[awayOwner].totalPoints += awayPoints;
      }
    }
  });

  const groups: GroupSummary[] = Object.entries(groupsMap).map(([groupName, teams]) => ({
    groupName,
    teams
  }));

  return {
    updatedAt: new Date().toISOString(),
    currentRound: 'Group Stage',
    leaderboard: Object.values(leaderboardMap),
    groups,
    recentResults,
    upcomingFixtures
  };
}

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openOwners, setOpenOwners] = useState<Record<string, boolean>>({
    Tim: true,
    James: true,
    Griffin: true
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Try to connect to Polymarket WebSocket
    polymarketService.connect()
      .then(() => {
        setIsConnected(true);
        console.log('Connected to Polymarket WebSocket');
        
        // Listen for match updates
        const unsubscribe = polymarketService.onMatchUpdate(() => {
          const matches = polymarketService.getCurrentMatches();
          const processedData = processMatches(Array.from(matches));
          setData(processedData);
        });

        // Initial load of matches if any are already cached
        const matches = polymarketService.getCurrentMatches();
        if (matches.length > 0) {
          const processedData = processMatches(matches);
          setData(processedData);
        }

        return unsubscribe;
      })
      .catch(err => {
        console.error('Failed to connect to Polymarket:', err);
        setLoadError(`WebSocket connection failed: ${err.message}. Attempting to load fallback data...`);
        
        // Fallback to static JSON
        fetch('data/leaderboard.json')
          .then(res => {
            if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
            return res.json();
          })
          .then(setData)
          .catch(fallbackErr => setLoadError(fallbackErr.message));
      });

    return () => {
      polymarketService.disconnect();
    };
  }, []);

  function toggleOwner(owner: string) {
    setOpenOwners(prev => ({ ...prev, [owner]: !prev[owner] }));
  }

  if (loadError) {
    return (
      <div className="error-banner">
        {loadError}
      </div>
    );
  }

  if (!data) {
    return <div className="empty-state">Loading scoreboard{isConnected ? ' from Polymarket' : ''}…</div>;
  }

  const sortedLeaderboard = [...data.leaderboard].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return OWNER_ORDER.indexOf(a.owner) - OWNER_ORDER.indexOf(b.owner);
  });

  return (
    <div>
      <div className="status-row">
        <span>
          Updated: <strong>{formatUpdatedAt(data.updatedAt)}</strong>
        </span>
        <span>
          Status: <strong>{isConnected ? '🟢 Live' : '⚪ Cached'}</strong>
        </span>
        {data.currentRound && (
          <span>
            Current round: <strong>{data.currentRound}</strong>
          </span>
        )}
      </div>

      {data.error && (
        <div className="error-banner">
          Data feed issue: {data.error}. Showing last available data.
        </div>
      )}

      <h2 className="section-heading">Standings</h2>
      <div className="standings">
        {sortedLeaderboard.map((entry, idx) => (
          <div className="owner-card" key={entry.owner}>
            <div
              className="owner-card__header"
              role="button"
              tabIndex={0}
              onClick={() => toggleOwner(entry.owner)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') toggleOwner(entry.owner);
              }}
            >
              <div className="owner-card__rank">{idx + 1}</div>
              <div className="owner-card__name">{entry.owner}</div>
              <div className="owner-card__points">
                {formatPoints(entry.totalPoints)}
                <span>pts</span>
              </div>
              <div className={`owner-card__toggle ${openOwners[entry.owner] ? 'is-open' : ''}`}>
                &#9660;
              </div>
            </div>
            {openOwners[entry.owner] && (
              <div className="owner-card__body">
                {entry.teams.map(team => (
                  <div className="team-row" key={team.teamName}>
                    <div className="team-row__name">{team.teamName}</div>
                    <div className="team-row__group">
                      {team.groupName ? (
                        <>
                          {team.groupName}
                          {team.rank && (
                            <span
                              className={`rank-pill ${team.rank <= 2 ? 'rank-pill--gold' : ''}`}
                              style={{ marginLeft: '0.4rem' }}
                            >
                              {team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : `${team.rank}th`}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="team-row__record">
                      {team.played > 0
                        ? `${team.wins}W ${team.draws}D ${team.losses}L`
                        : 'Not started'}
                    </div>
                    <div className="team-row__points">
                      {formatPoints(team.totalPoints)}
                      {(team.groupPoints > 0 || team.knockoutPoints > 0) && (
                        <span className="breakdown">
                          {team.groupPoints > 0 && `grp ${formatPoints(team.groupPoints)}`}
                          {team.groupPoints > 0 && team.knockoutPoints > 0 && ' + '}
                          {team.knockoutPoints > 0 && `KO ${formatPoints(team.knockoutPoints)}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.groups.length > 0 && (
        <>
          <h2 className="section-heading">Group Stage</h2>
          <div className="groups-grid">
            {data.groups.map(group => (
              <div className="group-card" key={group.groupName}>
                <div className="group-card__header">{group.groupName}</div>
                <table className="group-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Owner</th>
                      <th className="num">P</th>
                      <th className="num">W</th>
                      <th className="num">D</th>
                      <th className="num">L</th>
                      <th className="num">GD</th>
                      <th className="num">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.teams.map(team => (
                      <tr key={team.teamName} className={(team.rank && team.rank <= 2) ? 'qualified' : ''}>
                        <td className="team-name">{team.teamName}</td>
                        <td className="owner-tag">{team.owner || '—'}</td>
                        <td className="num">{team.played}</td>
                        <td className="num">{team.wins}</td>
                        <td className="num">{team.draws}</td>
                        <td className="num">{team.losses}</td>
                        <td className="num">{team.goalsDiff > 0 ? `+${team.goalsDiff}` : team.goalsDiff}</td>
                        <td className="num">{team.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-heading">Fixtures</h2>
      <div className="fixtures-columns">
        <div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(16,32,25,0.5)', marginBottom: '0.5rem' }}>
            Recent Results
          </h3>
          <div className="fixture-list">
            {data.recentResults.length === 0 && (
              <div className="empty-state">No completed matches yet.</div>
            )}
            {data.recentResults.map((f, i) => (
              <div className="fixture-row" key={i}>
                <div className="fixture-row__teams">
                  <div className="fixture-row__team">
                    <span>{f.home}</span>
                    <span className="fixture-row__score">{f.homeGoals}</span>
                  </div>
                  <div className="fixture-row__team">
                    <span>{f.away}</span>
                    <span className="fixture-row__score">{f.awayGoals}</span>
                  </div>
                </div>
                <div className="fixture-row__meta">{f.round}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(16,32,25,0.5)', marginBottom: '0.5rem' }}>
            Upcoming
          </h3>
          <div className="fixture-list">
            {data.upcomingFixtures.length === 0 && (
              <div className="empty-state">No upcoming matches scheduled.</div>
            )}
            {data.upcomingFixtures.map((f, i) => (
              <div className="fixture-row" key={i}>
                <div className="fixture-row__teams">
                  <div className="fixture-row__team">
                    <span>{f.home}</span>
                  </div>
                  <div className="fixture-row__team">
                    <span>{f.away}</span>
                  </div>
                </div>
                <div className="fixture-row__meta">
                  {f.round}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
