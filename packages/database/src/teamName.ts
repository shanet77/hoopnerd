const multiWordMascots = new Set(['Trail Blazers']);

export function splitTeamName(fullTeamName: string) {
  if (!fullTeamName) {
    return { city: '', teamName: '' };
  }

  const ofIndex = fullTeamName.indexOf(' of ');
  if (ofIndex > -1) {
    return {
      teamName: fullTeamName.slice(0, ofIndex).trim(),
      city: fullTeamName.slice(ofIndex + 4).trim(),
    };
  }

  for (const mascot of multiWordMascots) {
    if (fullTeamName.endsWith(mascot)) {
      return {
        city: fullTeamName.slice(0, -mascot.length).trim(),
        teamName: mascot,
      };
    }
  }

  const parts = fullTeamName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { city: fullTeamName, teamName: fullTeamName };
  }

  return {
    city: parts.slice(0, -1).join(' '),
    teamName: parts[parts.length - 1],
  };
}
