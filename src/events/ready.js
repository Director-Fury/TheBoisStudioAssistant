import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { restoreMaintenanceMode } from "../utils/maintenanceMode.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      try {
        const maintenanceEnabled = await restoreMaintenanceMode(client);
        if (maintenanceEnabled) {
          startupLog("Maintenance mode restored from persistent storage");
        }
      } catch (error) {
        logger.error("Could not restore maintenance mode from persistent storage:", error);
        client.maintenanceMode = false;
        client.user.setPresence(config.bot.presence);
      }

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};

