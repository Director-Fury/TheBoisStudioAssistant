import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function getSuggestionPortalUrl() {
  const configuredUrl = process.env.LOVABLE_SUGGESTION_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Open the community suggestion portal.')
    .setDMPermission(false),
  category: 'Community',

  async execute(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    const suggestionUrl = getSuggestionPortalUrl();
    if (!suggestionUrl) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'The suggestion portal is not configured yet. Please contact a server administrator.',
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Suggestion Portal')
        .setStyle(ButtonStyle.Link)
        .setURL(suggestionUrl),
    );

    return InteractionHelper.safeEditReply(interaction, {
      content: 'Share your idea through the community suggestion portal:',
      components: [row],
    });
  },
};
