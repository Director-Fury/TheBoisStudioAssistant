import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('introduce')
    .setDescription('Post a short introduction in this channel.')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('about')
        .setDescription('Tell the community a little about yourself')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500),
    ),
  category: 'Community',

  async execute(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    if (!interaction.channel?.isTextBased() || typeof interaction.channel.send !== 'function') {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Introductions can only be posted in a text channel.',
      });
    }

    const memberName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    const embed = new EmbedBuilder()
      .setTitle(`👋 Meet ${memberName}`.slice(0, 256))
      .setDescription(interaction.options.getString('about'))
      .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
      .setColor(0x5865f2)
      .setTimestamp();

    const message = await interaction.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    return InteractionHelper.safeEditReply(interaction, {
      content: `Your introduction has been posted: ${message.url}`,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
  },
};
