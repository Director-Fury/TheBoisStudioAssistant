import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

// Note: This scaffolding uses a runtime setTimeout for short durations and
// includes a TODO to persist removals for long-running schedules.

export default {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Give a role to a user for a limited time (minutes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(opt => opt.setName('user').setDescription('User to give the role to').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true)),
  category: 'Moderation',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Roles** to use this command.')], flags: MessageFlags.Ephemeral });
      }

      const member = interaction.options.getMember('user', true);
      const role = interaction.options.getRole('role', true);
      const minutes = interaction.options.getInteger('duration', true);

      await member.roles.add(role);
      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Role Assigned', `${role} assigned to ${member} for ${minutes} minute(s).`)], flags: MessageFlags.Ephemeral });

      // Schedule removal for short durations; recommend persistent storage for longer ones.
      const ms = Math.max(0, minutes) * 60_000;
      if (ms > 0 && ms <= 7 * 24 * 60 * 60 * 1000) { // up to 7 days in-memory
        setTimeout(async () => {
          try {
            await member.roles.remove(role);
            logger.info(`temprole removed ${role.id} from ${member.id} after ${minutes} minutes`);
          } catch (err) {
            logger.error('temprole removal error:', err);
          }
        }, ms);
      } else {
        // TODO: Persist scheduled removal in DB and a worker to process it.
      }
    } catch (error) {
      logger.error('temprole command error:', error);
      await handleInteractionError(interaction, error, { commandName: 'temprole', source: 'temprole_command' });
    }
  },
};
