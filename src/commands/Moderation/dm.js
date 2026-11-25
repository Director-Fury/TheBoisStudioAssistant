import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const serverDmColors = new Map([
    ['1365612445342629918', '#f54c4e'], // The Bois Studio | Public
    ['1042620015402291270', '#0ca7c7'], // The Bois Studio | Private
    ['1367772622678659083', '#0ddd0a'], // Server Assistant | Support
]);

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message to a user (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to send a DM to")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("user_id")
                .setDescription("A Discord user ID, if the user is not available in the picker")
                .setMinLength(17)
                .setMaxLength(20)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Send the message anonymously (default: false)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("department")
                .setDescription("Department shown when sending anonymously")
                .addChoices(
                    { name: "General Support Team", value: "General Support Team" },
                    { name: "Management Support Team", value: "Management Support Team" },
                    { name: "Maintenance Team", value: "Maintenance Team" },
                    { name: "Security Team", value: "Security Team" },
                    { name: "Development Team", value: "Development Team" },
                    { name: "Management Team", value: "Management Team" },
                    { name: "Executives Team", value: "Executives Team" }
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("position")
                .setDescription("Your rank or position shown when sending as yourself")
                .setMaxLength(80)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "Moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const selectedUser = interaction.options.getUser("user");
        const userId = interaction.options.getString("user_id")?.trim();
        let targetUser = selectedUser;
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;
        const department = interaction.options.getString("department");
        const position = interaction.options.getString("position")?.trim();

        try {
            if (selectedUser && userId) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Choose One User", "Choose a user or enter a user ID, not both.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!selectedUser && !userId) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("User Required", "Choose a user or enter their Discord user ID.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (userId && !/^\d{17,20}$/.test(userId)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Invalid User ID", "Enter a valid Discord user ID containing 17 to 20 digits.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (userId) {
                try {
                    targetUser = await client.users.fetch(userId);
                } catch (error) {
                    logger.warn(`Could not fetch Discord user ${userId} for /dm:`, error);
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            "User Lookup Failed",
                            error.code === 10013
                                ? "No Discord user was found with that ID. Double-check the ID."
                                : "Could not look up that user right now. Please try again later."
                        )],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (anonymous && !department) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Department Required", "Choose the department sending this anonymous message.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!anonymous && !position) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Position Required", "Enter your rank or position so the recipient knows who is contacting them.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            
            if (message.length > 2000) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Message Too Long",
                            "Messages must be under 2000 characters."
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            
            if (targetUser.bot) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Cannot DM Bot",
                            "You cannot send DMs to bot accounts."
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            
            const sanitized = sanitizeMarkdown(message);

            const dmChannel = await targetUser.createDM();

            const displayName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
            await dmChannel.send({
                embeds: [
                    buildStaffDmEmbed({
                        serverName: interaction.guild.name,
                        anonymous,
                        serverId: interaction.guildId,
                        department,
                        displayName,
                        position,
                        message: sanitized,
                        serverIconUrl: interaction.guild.iconURL({ size: 128 }),
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "DM Sent",
                        `Successfully sent a message to ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);
            
if (error.code === 50007) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed("Error", `Could not send a DM to ${targetUser?.tag || userId}. They may have DMs disabled or blocked messages from this bot.`),
                    ],
                });
            }
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed("Error", `Failed to send DM: ${error.message}`),
                ],
            });
        }
    }
};

export function buildStaffDmEmbed({
    serverId,
    serverName,
    anonymous,
    department,
    displayName,
    position,
    message,
    serverIconUrl,
}) {
    const title = `Message from **${serverName}**`;
    const signature = anonymous
        ? `**${department}**\n${serverName}`
        : `**${displayName}**\n*${position}*${department ? ` / **${department}**` : ''}\n${serverName}`;
    const description = `${message}\n\n${signature}`;

    const embed = createEmbed({
        title,
        description,
        color: 'success',
        footer: 'You can reply to this message; our team will receive your message(s).',
        timestamp: true,
    });

    embed.setColor(serverDmColors.get(serverId) || '#57f287');
    if (serverIconUrl) {
        embed.setThumbnail(serverIconUrl);
    }

    return embed;
}
