export async function getRoleRecipients(guild, role) {
  if (!guild?.members?.fetch) {
    return [];
  }

  const fetchedMembers = await guild.members.fetch({ force: true }).catch(() => null);
  const memberList = fetchedMembers && typeof fetchedMembers.values === 'function'
    ? [...fetchedMembers.values()]
    : Array.isArray(fetchedMembers)
      ? fetchedMembers
      : [];

  if (!role?.id) {
    return [];
  }

  return memberList.filter(member => {
    if (!member || member.user?.bot) return false;
    return member.roles?.cache?.has(role.id) || role.members?.has?.(member.id);
  });
}
