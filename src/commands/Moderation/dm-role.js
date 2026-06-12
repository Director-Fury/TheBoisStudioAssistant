import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

// Sends a DM to every non-bot member who has the specified role.
// Note: For large roles consider batching and persisting job state to avoid rate limits.

export default {
  data: new SlashCommandBuilder()
    .setName('dm-role')
    .setDescription('Send a DM to every member of a role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(opt => opt.setName('role').setDescription('Role to DM').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true))
    .addBooleanOption(opt => opt.setName('mention').setDescription('Mention the role in the DM')),
  category: 'Moderation',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** to use this command.')], flags: MessageFlags.Ephemeral });
      }

      const role = interaction.options.getRole('role', true);
      const text = interaction.options.getString('message', true);
      const mention = interaction.options.getBoolean('mention') || false;

      const members = role.members.filter(m => !m.user.bot);
      const total = members.size;

      if (total === 0) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('No Members', 'No non-bot members found for that role.')], flags: MessageFlags.Ephemeral });
      }

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Sending', `Attempting to DM ${total} member(s). This may take a while.`)], flags: MessageFlags.Ephemeral });

      let success = 0;
      let failed = 0;

      for (const [, member] of members) {
        try {
          const content = mention ? `${role} ${text}` : text;
          await member.send({ content });
          success += 1;
        } catch (err) {
          failed += 1;
          logger.warn(`Failed to DM ${member.id}: ${err?.message ?? err}`);
        }
        // Be kind to rate limits — small delay could be added here if needed.
      }

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('DM Complete', `DMed ${success} / ${total} member(s). ${failed} failed.`)], flags: MessageFlags.Ephemeral });
      logger.info(`dm-role executed by ${interaction.user.id} in ${interaction.guildId}: ${success}/${total} succeeded`);
    } catch (error) {
      logger.error('dm-role command error:', error);
      await handleInteractionError(interaction, error, { commandName: 'dm-role', source: 'dm_role_command' });
    }
  },
};
