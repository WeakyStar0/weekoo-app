const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { addXp } = require('../../utils/leveling'); 

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
            const res = await db.query('SELECT last_daily, streak FROM users WHERE discord_id = $1', [userId]);
            
            // auto create user if missing
            if (res.rows.length === 0) {
                await db.query('INSERT INTO users (discord_id, username, weekoins, last_daily, streak, level, xp) VALUES ($1, $2, $3, NOW(), 1, 1, 0)', 
                    [userId, interaction.user.username, BASE_REWARD]);
                
                await addXp(userId, FLAT_XP, interaction);

                return interaction.reply(`🎁 First claim! You got **${BASE_REWARD}** <:weekoin:1465807554927132883> and **${FLAT_XP} XP**!`);
            }

            const userData = res.rows[0];
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

            // trigger XP Manager
            await addXp(userId, FLAT_XP, interaction);

        } catch (error) {
            console.error('Daily Command Error:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'Failed to process daily.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};