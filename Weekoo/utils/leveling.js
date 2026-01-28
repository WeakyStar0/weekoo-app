const db = require('./db');
const { EmbedBuilder } = require('discord.js');

/**
 * Calculates XP required for the NEXT level.
 * Formula: 100 + 0.04 * (lvl-1)^3 + 0.8 * (lvl-1)^2 + 2 * (lvl-1) + 0.5
 */
function getXpNeeded(level) {
    const x = level - 1;
    const result = 100 + (0.04 * Math.pow(x, 3)) + (0.8 * Math.pow(x, 2)) + (2 * x) + 0.5;
    return Math.floor(result);
}

/**
 * Adds XP to a user, handles level ups, saves to DB, and announces it.
 * @param {string} userId - The Discord User ID
 * @param {number} xpToAdd - Amount of XP to add
 * @param {object} interaction - The interaction object (to send the announcement)
 */


function getTotalXp(level, currentXp) {
    let total = 0;
    // Sum up the requirements for every level passed so far
    for (let i = 1; i < level; i++) {
        total += getXpNeeded(i);
    }
    // Add the current progress
    return total + currentXp;
}

async function addXp(userId, xpToAdd, interaction) {
    try {
        // 1. Get current stats
        const res = await db.query('SELECT level, xp FROM users WHERE discord_id = $1', [userId]);

        // Safety check: If user doesn't exist (unlikely if called from a command), do nothing or return
        if (res.rows.length === 0) return;

        let { level, xp } = res.rows[0];

        // Ensure values are numbers (DB sometimes returns strings for big ints, though usually int for integer)
        level = parseInt(level) || 1;
        xp = parseInt(xp) || 0;

        // 2. Add XP
        xp += xpToAdd;

        // 3. Level Up Check
        let leveledUp = false;
        let startLevel = level;
        let xpNeeded = getXpNeeded(level);

        // While loop handles multi-level jumps (rare, but possible with big XP gains)
        while (xp >= xpNeeded) {
            xp -= xpNeeded; // Carry over overflow XP
            level++;
            leveledUp = true;
            xpNeeded = getXpNeeded(level);
        }

        // 4. Update Database
        await db.query('UPDATE users SET level = $1, xp = $2 WHERE discord_id = $3', [level, xp, userId]);

        // 5. ANNOUNCE LEVEL UP
        if (leveledUp && interaction) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700') // Gold
                .setTitle('🎉 LEVEL UP!')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setDescription(`Congratulations <@${userId}>!\nYou reached **Level ${level}**!`)
                .setFooter({ text: `Next level in ${xpNeeded - xp} XP` });

            // We use followUp so it sends a NEW message after the command reply
            // We verify if the interaction allows followups, otherwise we try channel.send
            if (interaction.followUp) {
                await interaction.followUp({ embeds: [embed], ephemeral: false });
            } else if (interaction.channel) {
                await interaction.channel.send({ embeds: [embed] });
            }
        }

    } catch (error) {
        console.error('Error in addXp:', error);
    }
}

module.exports = { getXpNeeded, addXp, getTotalXp };