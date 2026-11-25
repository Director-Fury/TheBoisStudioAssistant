import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MAX_FAQS = 25;
let faqIdCounter = 0;

function getEntries(config) {
  if (!Array.isArray(config.communityFaqs)) return [];
  return config.communityFaqs.filter(entry =>
    entry &&
    typeof entry.id === 'string' &&
    typeof entry.question === 'string' &&
    typeof entry.answer === 'string',
  );
}

function isManager(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('View and manage frequently asked questions.')
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand.setName('list').setDescription('List the server FAQs'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View an FAQ answer')
        .addStringOption(option =>
          option.setName('id').setDescription('FAQ ID from /faq list').setRequired(true).setMaxLength(20),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a server FAQ (Manage Server required)')
        .addStringOption(option =>
          option.setName('question').setDescription('The frequently asked question').setRequired(true).setMaxLength(100),
        )
        .addStringOption(option =>
          option.setName('answer').setDescription('The answer to show members').setRequired(true).setMaxLength(1000),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a server FAQ (Manage Server required)')
        .addStringOption(option =>
          option.setName('id').setDescription('FAQ ID from /faq list').setRequired(true).setMaxLength(20),
        ),
    ),
  category: 'Community',

  async execute(interaction, _guildConfig, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    const subcommand = interaction.options.getSubcommand();
    if ((subcommand === 'add' || subcommand === 'remove') && !isManager(interaction)) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'You need Manage Server permission to add or remove FAQs.',
      });
    }

    try {
      const config = await getGuildConfig(client, interaction.guildId);
      const entries = getEntries(config);

      if (subcommand === 'list') {
        const embed = new EmbedBuilder()
          .setTitle('Frequently Asked Questions')
          .setDescription(entries.length
            ? 'Use `/faq view id:<ID>` to read an answer.'
            : 'No FAQs have been added to this server yet.');

        for (const entry of entries) {
          embed.addFields({
            name: entry.question,
            value: `ID: \`${entry.id}\``,
          });
        }

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
      }

      if (subcommand === 'view') {
        const id = interaction.options.getString('id').trim();
        const entry = entries.find(item => item.id === id);
        return InteractionHelper.safeEditReply(interaction, {
          content: entry ? `**${entry.question}**\n${entry.answer}` : 'No FAQ was found with that ID.',
          allowedMentions: { parse: [] },
        });
      }

      if (subcommand === 'add') {
        if (entries.length >= MAX_FAQS) {
          return InteractionHelper.safeEditReply(interaction, {
            content: `This server has reached the limit of ${MAX_FAQS} FAQs.`,
          });
        }

        const entry = {
          id: `${Date.now().toString(36)}${(faqIdCounter++).toString(36)}`,
          question: interaction.options.getString('question').trim(),
          answer: interaction.options.getString('answer').trim(),
        };
        const saved = await setGuildConfig(client, interaction.guildId, {
          ...config,
          communityFaqs: [...entries, entry],
        });
        if (!saved) throw new Error('FAQ changes were not saved.');
        return InteractionHelper.safeEditReply(interaction, {
          content: `FAQ added with ID \`${entry.id}\`.`,
          allowedMentions: { parse: [] },
        });
      }

      const id = interaction.options.getString('id').trim();
      const remainingEntries = entries.filter(entry => entry.id !== id);
      if (remainingEntries.length === entries.length) {
        return InteractionHelper.safeEditReply(interaction, {
          content: 'No FAQ was found with that ID.',
        });
      }

      const saved = await setGuildConfig(client, interaction.guildId, {
        ...config,
        communityFaqs: remainingEntries,
      });
      if (!saved) throw new Error('FAQ changes were not saved.');
      return InteractionHelper.safeEditReply(interaction, {
        content: 'FAQ removed.',
      });
    } catch (error) {
      logger.error('FAQ command failed:', error);
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Could not load or update the server FAQs. Please try again later.',
      });
    }
  },
};
