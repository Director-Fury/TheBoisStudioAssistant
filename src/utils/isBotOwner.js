export function isBotOwner(interaction, client) {
    const ownerIds = client.config.bot.commands.owners;
    const applicationOwner = client.application?.owner;

    return ownerIds.includes(interaction.user.id) ||
        applicationOwner?.id === interaction.user.id ||
        applicationOwner?.ownerId === interaction.user.id;
}