const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward and build your streak!'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const BASE_REWARD = 100;
        const MS_PER_HOUR = 60 * 60 * 1000;
        const COOLDOWN = 24 * MS_PER_HOUR;
        const STREAK_EXPIRY = 48 * MS_PER_HOUR;

        try {
            const res = await db.query('SELECT last_daily, streak FROM users WHERE discord_id = $1', [userId]);
            
            // Auto-create user if they don't exist
            if (res.rows.length === 0) {
                await db.query('INSERT INTO users (discord_id, username, weekoins, last_daily, streak) VALUES ($1, $2, $3, NOW(), 1)', 
                    [userId, interaction.user.username, BASE_REWARD]);
                return interaction.reply(`🎁 First claim! You got **${BASE_REWARD}** Weekoins and started a **1-day streak**!`);
            }

            const lastDaily = res.rows[0].last_daily;
            let currentStreak = res.rows[0].streak || 0;
            const now = new Date();
            const timeDiff = lastDaily ? now - new Date(lastDaily) : Infinity;

            // 1. Cooldown Check (Under 24 hours)
            if (timeDiff < COOLDOWN) {
                const remaining = COOLDOWN - timeDiff;
                const hours = Math.floor(remaining / MS_PER_HOUR);
                const minutes = Math.floor((remaining % MS_PER_HOUR) / (60 * 1000));
                return interaction.reply({ 
                    content: `⏳ You're too early! Come back in **${hours}h ${minutes}m**.`, 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            // 2. Streak Logic
            let streakBroken = false;
            if (timeDiff >= STREAK_EXPIRY) {
                currentStreak = 1; // Reset streak
                streakBroken = true;
            } else {
                currentStreak += 1; // Maintain streak
            }

            // 3. Calculate Bonus (+2 per streak day)
            // Day 1 = 100, Day 2 = 102, Day 3 = 104...
            const bonus = (currentStreak - 1) * 2;
            const totalReward = BASE_REWARD + bonus;

            await db.query(
                'UPDATE users SET weekoins = weekoins + $1, last_daily = NOW(), streak = $2 WHERE discord_id = $3',
                [totalReward, currentStreak, userId]
            );

            const embed = new EmbedBuilder()
                .setColor(streakBroken ? '#FFA500' : '#00FF00') // Orange if broken, Green if kept
                .setTitle(streakBroken ? '💔 Streak Broken!' : '🔥 Streak Growing!')
                .setDescription(`You claimed **${totalReward}** Weekoins!\n${streakBroken ? 'You missed a day, so your streak reset to **1**.' : `Current Streak: **${currentStreak} days**`}`)
                .addFields({ name: 'Bonus Coins', value: `<:weekoin:1465807554927132883> +${bonus}`, inline: true })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Daily Command Error:', error);
            await interaction.reply({ content: 'Failed to process your daily claim.', flags: [MessageFlags.Ephemeral] });
        }
    },
};