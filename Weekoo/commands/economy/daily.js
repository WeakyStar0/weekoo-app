const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { addXp } = require('../../utils/leveling'); 
const { ensureUserExists } = require('../../utils/userRegistry'); // Import the helper

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward and build your streak!'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const BASE_REWARD = 100;
        const FLAT_XP = 20; 
        const MS_PER_HOUR = 60 * 60 * 1000;
        const COOLDOWN = 24 * MS_PER_HOUR;
        const STREAK_EXPIRY = 48 * MS_PER_HOUR;

        try {
            const userData = await ensureUserExists(userId, interaction.user.username);

            const now = new Date();
            const timeDiff = userData.last_daily ? now - new Date(userData.last_daily) : Infinity;

            if (timeDiff < COOLDOWN) {
                const remaining = COOLDOWN - timeDiff;
                const hours = Math.floor(remaining / MS_PER_HOUR);
                const minutes = Math.floor((remaining % MS_PER_HOUR) / (60 * 1000));
                return interaction.reply({ 
                    content: `⏳ You're too early! Come back in **${hours}h ${minutes}m**.`, 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            let currentStreak = userData.streak || 0;
            let streakBroken = false;
            if (timeDiff >= STREAK_EXPIRY) {
                currentStreak = 1;
                streakBroken = true;
            } else {
                currentStreak += 1;
            }

            const coinBonus = (currentStreak - 1) * 2;
            const totalCoins = BASE_REWARD + coinBonus;

            await db.query(
                'UPDATE users SET weekoins = weekoins + $1, last_daily = NOW(), streak = $2 WHERE discord_id = $3',
                [totalCoins, currentStreak, userId]
            );

            const embed = new EmbedBuilder()
                .setColor(streakBroken ? '#FFA500' : '#00FF00')
                .setTitle(streakBroken ? '💔 Streak Broken' : '🔥 Daily Claimed')
                .setDescription(`You claimed **${totalCoins}** Weekoins!`)
                .addFields(
                    { name: 'Coins', value: `${BASE_REWARD} + ${coinBonus} bonus`, inline: true },
                    { name: 'XP', value: `+${FLAT_XP} XP`, inline: true },
                    { name: 'Streak', value: `${currentStreak} Days`, inline: true }
                );

            await interaction.reply({ embeds: [embed] });
            await addXp(userId, FLAT_XP, interaction);

        } catch (error) {
            console.error('Daily Command Error:', error);
            if (!interaction.replied) await interaction.reply({ content: 'Failed to process daily.', flags: [MessageFlags.Ephemeral] });
        }
    },
};