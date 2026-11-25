import {
  EmbedBuilder,
  GuildExplicitContentFilter,
  GuildMFALevel,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  GuildVerificationLevel,
} from 'discord.js';
import { isConfiguredBotOwner } from '../../utils/isBotOwner.js';
import { logger } from '../../utils/logger.js';

const elevatedPermissions = [
  ['Administrator', PermissionFlagsBits.Administrator],
  ['Manage Server', PermissionFlagsBits.ManageGuild],
  ['Manage Roles', PermissionFlagsBits.ManageRoles],
  ['Manage Channels', PermissionFlagsBits.ManageChannels],
  ['Manage Webhooks', PermissionFlagsBits.ManageWebhooks],
  ['Ban Members', PermissionFlagsBits.BanMembers],
  ['Kick Members', PermissionFlagsBits.KickMembers],
  ['Timeout Members', PermissionFlagsBits.ModerateMembers],
];

const everyoneRiskPermissions = [
  ...elevatedPermissions,
  ['Mention Everyone', PermissionFlagsBits.MentionEveryone],
];

const verificationLevels = new Map([
  [GuildVerificationLevel.None, 'None'],
  [GuildVerificationLevel.Low, 'Low'],
  [GuildVerificationLevel.Medium, 'Medium'],
  [GuildVerificationLevel.High, 'High'],
  [GuildVerificationLevel.VeryHigh, 'Very high'],
]);

const explicitContentFilters = new Map([
  [GuildExplicitContentFilter.Disabled, 'Disabled'],
  [GuildExplicitContentFilter.MembersWithoutRoles, 'Members without roles'],
  [GuildExplicitContentFilter.AllMembers, 'All members'],
]);

function getGrantedPermissions(permissions, definitions) {
  return definitions
    .filter(([, permission]) => permissions.has(permission, false))
    .map(([name]) => name);
}

function formatRoleName(name) {
  return name.replace(/[`*_~|]/g, '\\$&').replace(/[\r\n]/g, ' ').slice(0, 80);
}

function createSecurityReport(guild, botMember) {
  const findings = [];
  const mfaEnabled = guild.mfaLevel === GuildMFALevel.Elevated;
  const verificationLevel = verificationLevels.get(guild.verificationLevel);
  const explicitContentFilter = explicitContentFilters.get(guild.explicitContentFilter);
  const everyonePermissions = guild.roles.everyone.permissions;
  const everyoneGrants = getGrantedPermissions(everyonePermissions, everyoneRiskPermissions);
  const botGrants = getGrantedPermissions(botMember.permissions, elevatedPermissions);
  const privilegedRoles = [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id)
    .map(role => ({
      role,
      permissions: getGrantedPermissions(role.permissions, elevatedPermissions),
    }))
    .filter(({ permissions }) => permissions.length > 0);

  if (guild.mfaLevel === undefined) {
    findings.push('Could not determine whether moderator MFA is required.');
  } else if (!mfaEnabled) {
    findings.push('Moderator MFA is not required by the server.');
  }

  if (verificationLevel === undefined) {
    findings.push('Could not determine the server verification level.');
  } else if (guild.verificationLevel < GuildVerificationLevel.Medium) {
    findings.push(`Server verification is set to ${verificationLevel}, below Medium.`);
  }

  if (explicitContentFilter === undefined) {
    findings.push('Could not determine the explicit media filter setting.');
  } else if (guild.explicitContentFilter === GuildExplicitContentFilter.Disabled) {
    findings.push('The explicit media filter is disabled.');
  }

  if (everyoneGrants.length > 0) {
    findings.push(`@everyone has elevated permissions: ${everyoneGrants.join(', ')}.`);
  }

  if (botGrants.includes('Administrator')) {
    findings.push('The bot has Administrator permission; consider reducing it to only what its features need.');
  } else if (botGrants.length > 0) {
    findings.push(`The bot has elevated permissions: ${botGrants.join(', ')}.`);
  }

  if (privilegedRoles.length > 0) {
    findings.push(`${privilegedRoles.length} other role(s) have elevated permissions; review the role list.`);
  }

  const fields = [
    {
      name: 'Server security settings',
      value: [
        `Moderator MFA: ${guild.mfaLevel === undefined ? 'Unknown' : mfaEnabled ? 'Required' : 'Not required'}`,
        `Verification level: ${verificationLevel ?? 'Unknown'}`,
        `Explicit media filter: ${explicitContentFilter ?? 'Unknown'}`,
      ].join('\n'),
    },
    {
      name: 'Bot permissions',
      value: botGrants.length > 0 ? botGrants.join(', ') : 'No checked elevated permissions detected.',
    },
    {
      name: '@everyone permissions',
      value: everyoneGrants.length > 0 ? everyoneGrants.join(', ') : 'No checked elevated permissions detected.',
    },
    {
      name: `Other roles with elevated permissions (${privilegedRoles.length})`,
      value: privilegedRoles.length > 0
        ? privilegedRoles
            .slice(0, 10)
            .map(({ role, permissions }) => `${formatRoleName(role.name)}: ${permissions.join(', ')}`)
            .join('\n')
            .slice(0, 1024)
        : 'No checked elevated permissions detected.',
    },
    {
      name: `Findings (${findings.length})`,
      value: findings.length > 0 ? findings.join('\n').slice(0, 1024) : 'No issues found by these checks.',
    },
  ];

  return new EmbedBuilder()
    .setTitle(`Security Check: ${guild.name}`.slice(0, 256))
    .setDescription('Read-only checks of selected server settings and elevated permissions; this is not a complete security audit.')
    .addFields(fields)
    .setTimestamp();
}

export default {
  data: new SlashCommandBuilder()
    .setName('security-check')
    .setDescription('Run a private, read-only check of selected server security settings.')
    .setDMPermission(false),
  category: 'Developer',

  async execute(interaction, _guildConfig, client) {
    if (!isConfiguredBotOwner(interaction, client)) {
      return interaction.reply({
        content: 'Only developers listed in OWNER_IDS can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.guild) {
      return interaction.reply({
        content: 'This check is only available in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const embed = createSecurityReport(interaction.guild, botMember);
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      logger.error('Security check failed:', error);
      return interaction.editReply('Could not complete the security check. Check the bot logs for details.');
    }
  },
};
