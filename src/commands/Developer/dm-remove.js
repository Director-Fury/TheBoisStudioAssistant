import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isConfiguredBotOwner } from '../../utils/isBotOwner.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dm-remove')
    .setDescription("Delete the bot account's messages from a user DM history.")
    .addStringOption(option =>
      option
        .setName('user_id')
        .setDescription('The user ID whose DM history should be cleaned.')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    )
    .addBooleanOption(option =>
      option
        .setName('confirm')
        .setDescription('Confirm deletion of all bot-authored messages in this DM.')
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

    const userId = interaction.options.getString('user_id', true).trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        content: 'Enter a valid Discord user ID.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (userId === client.user.id) {
      return interaction.reply({
        content: 'The bot cannot clean its own DM history.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.options.getBoolean('confirm', true)) {
      return interaction.reply({
        content: 'Deletion was not confirmed. No messages were removed.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const targetUser = await client.users.fetch(userId);
      const dmChannel = await targetUser.createDM();
      let before;
      let deleted = 0;
      let failed = 0;

      while (true) {
        const page = await dmChannel.messages.fetch({
          limit: 100,
          ...(before ? { before } : {}),
        });
        if (page.size === 0) break;

        before = page.last().id;
        for (const message of page.values()) {
          if (message.author.id !== client.user.id) continue;
          try {
            await message.delete();
            deleted++;
          } catch (error) {
            failed++;
            logger.warn(`Could not delete bot DM ${message.id} for user ${userId}:`, error);
          }
        }
      }

      return interaction.editReply(
        `DM cleanup finished for <@${userId}>. Deleted ${deleted} bot-authored message(s).${failed ? ` ${failed} could not be deleted; see the bot logs.` : ''}`,
      );
    } catch (error) {
      logger.error(`Failed to clean DM history for user ${userId}:`, error);
      return interaction.editReply('Could not access or clean that DM history. Check the bot logs for details.');
    }
  },
};
