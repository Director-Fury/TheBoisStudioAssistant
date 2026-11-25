import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { WarningService } from '../../services/warningService.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

const caseTypes = {
  note: {
    action: 'Case Note Added',
    permission: PermissionFlagsBits.ManageMessages,
  },
  warning: {
    action: 'User Warned',
    permission: PermissionFlagsBits.ModerateMembers,
  },
  suggestion: {
    action: 'Suggested Action',
    permission: PermissionFlagsBits.ManageMessages,
  },
};

export default {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Add a moderation note, warning, or suggested action to a user’s case history.')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user this case is about')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('The kind of case entry to create')
        .setRequired(true)
        .addChoices(
          { name: 'Note', value: 'note' },
          { name: 'Warning', value: 'warning' },
          { name: 'Suggested action', value: 'suggestion' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('details')
        .setDescription('Reason, note, or suggested action')
        .setMinLength(1)
        .setMaxLength(1000)
        .setRequired(true),
    ),
  category: 'Moderation',

  async execute(interaction, _guildConfig, client) {
    const target = interaction.options.getUser('target');
    const type = interaction.options.getString('type');
    const details = interaction.options.getString('details')?.trim();
    const caseType = caseTypes[type];

    if (!interaction.guild || !target || !caseType || !details) {
      return interaction.reply({
        content: 'This command needs a server, a target user, a valid case type, and non-empty details.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.memberPermissions?.has(caseType.permission)) {
      const permissionLabel = type === 'warning' ? 'Moderate Members' : 'Manage Messages';
      return interaction.reply({
        content: `You need the ${permissionLabel} permission to create this type of case.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = type === 'warning' ? interaction.options.getMember('target') : null;
    if (type === 'warning' && !member) {
      return interaction.reply({
        content: 'Warnings can only be issued to users who are currently in this server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let warningCount;
    try {
      if (type === 'warning') {
        const warning = await WarningService.addWarning({
          guildId: interaction.guild.id,
          userId: target.id,
          moderatorId: interaction.user.id,
          reason: details,
        });
        if (!warning.success) {
          throw new Error(warning.error || 'Could not store the warning.');
        }
        warningCount = warning.totalCount;
      }

      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: caseType.action,
          target: `${target.tag ?? target.username} (${target.id})`,
          executor: `${interaction.user.tag ?? interaction.user.username} (${interaction.user.id})`,
          reason: details,
          metadata: {
            userId: target.id,
            moderatorId: interaction.user.id,
            caseType: type,
            ...(warningCount === undefined ? {} : { totalWarnings: warningCount }),
          },
        },
      });

      const warningSummary = warningCount === undefined ? '' : ` Total active warnings: ${warningCount}.`;
      return interaction.editReply(
        `Created ${type} case #${caseId} for ${target.tag ?? target.username}.${warningSummary}`,
      );
    } catch (error) {
      logger.error('Failed to create moderation case:', error);
      if (warningCount !== undefined) {
        return interaction.editReply(
          'The warning was saved, but its moderation case could not be recorded. Check the bot logs before retrying.',
        );
      }
      return interaction.editReply('Could not create the case. Check the bot logs for details.');
    }
  },
};
