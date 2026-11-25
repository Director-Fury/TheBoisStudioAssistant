import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

const staffRoleNames = new Set(['staff', 'staff team', 'staff member']);

function normalizeRoleName(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getDisplayName(member, user) {
  return (member?.displayName || user.globalName || user.username).slice(0, 80);
}

function createPageMessage(requesterName, requestedName, guildName, channelName, messageUrl) {
  return [
    `Hi ${requestedName}, ${requesterName} has asked for you.`,
    `Server: ${guildName}`,
    `Channel: #${channelName}`,
    `Open the page request: ${messageUrl}`,
  ].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('page')
    .setDescription('Ask a user to join you in this server.')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to ask for')
        .setRequired(true),
    ),
  category: 'Moderation',

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command is only available in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let requester;
    try {
      requester = await interaction.guild.members.fetch(interaction.user.id);
    } catch (error) {
      logger.error("Could not verify the paging requester's server roles:", error);
      return interaction.editReply('Could not verify your server roles. Please try again later.');
    }

    const isStaff = requester.roles.cache.some(role => staffRoleNames.has(normalizeRoleName(role.name)));
    if (!isStaff) {
      return interaction.editReply('Only members with the Staff, Staff Team, or Staff Member role can use this command.');
    }

    const requestedUser = interaction.options.getUser('user');
    if (!requestedUser || requestedUser.bot) {
      return interaction.editReply('Choose a valid user account to page.');
    }

    if (requestedUser.id === interaction.user.id) {
      return interaction.editReply('You cannot page yourself.');
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return interaction.editReply('Paging is only available from a text channel.');
    }

    const requesterName = getDisplayName(requester, interaction.user);
    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(requestedUser.id).catch(error => {
        if (error.code === 10007) return null;
        throw error;
      });
    } catch (error) {
      logger.error("Could not fetch the paged user's server membership:", error);
      return interaction.editReply('Could not check the requested user. Please try again later.');
    }

    const requestedName = getDisplayName(targetMember, requestedUser);
    let announcement;
    try {
      announcement = await channel.send({
        content: `Hi ${requesterName}, ${requestedName} has been requested.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.error("Could not post the paging announcement:", error);
      return interaction.editReply('Could not post the page announcement. Check that I can send messages in this channel.');
    }

    try {
      const dmChannel = await requestedUser.createDM();
      await dmChannel.send({
        content: createPageMessage(
          requesterName,
          requestedName,
          interaction.guild.name,
          channel.name || 'this channel',
          announcement.url,
        ),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.warn("Could not DM the paged user; removing the page announcement.", {
        guildId: interaction.guild.id,
        userId: requestedUser.id,
        error,
      });

      try {
        await announcement.delete();
      } catch (deleteError) {
        logger.error("Could not remove a paging announcement after the user DM failed:", deleteError);
        return interaction.editReply(
          'The user could not be DMed, and I could not remove the channel announcement. Please check the channel.',
        );
      }

      return interaction.editReply(
        'I could not DM that user, so I removed the page announcement. They may have DMs closed or may have blocked the bot.',
      );
    }

    return interaction.editReply(`Paged ${requestedName} by DM.`);
  },
};
