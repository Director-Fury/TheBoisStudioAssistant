import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isConfiguredBotOwner } from '../../utils/isBotOwner.js';
import { setMaintenanceMode } from '../../utils/maintenanceMode.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Enable or disable bot maintenance mode.')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('Whether to enable or disable maintenance mode.')
        .addChoices(
          { name: 'Enable', value: 'enable' },
          { name: 'Disable', value: 'disable' },
        )
        .setRequired(true),
    )
    .setDMPermission(false),
  category: 'Developer',

  async execute(interaction, _guildConfig, client) {
    if (!isConfiguredBotOwner(interaction, client)) {
      return interaction.reply({
        content: 'Only developers listed in OWNER_IDS can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const enabled = interaction.options.getString('mode', true) === 'enable';
    if (enabled === Boolean(client.maintenanceMode)) {
      return interaction.reply({
        content: `Maintenance mode is already ${enabled ? 'enabled' : 'disabled'}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await setMaintenanceMode(client, enabled);
      return interaction.editReply(
        `Maintenance mode ${enabled ? 'enabled' : 'disabled'}. The bot is now ${enabled ? 'in DND status and will auto-reply to DMs' : 'back to its configured presence and normal DM handling'}.`,
      );
    } catch (error) {
      logger.error('Failed to update bot maintenance mode:', error);
      return interaction.editReply('Could not update maintenance mode. Check the bot logs for details.');
    }
  },
};
