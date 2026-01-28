const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');
const { getTotalXp } = require('../../utils/leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the top players in the server.')
        .addSubcommand(sub => 
            sub.setName('weekoins')
                .setDescription('Top 10 richest players.'))
        .addSubcommand(sub => 
            sub.setName('xp')
                .setDescription('Top 10 most experienced players.')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const WEEKOIN_EMOJI = '<:weekoin:1465807554927132883>';

        await interaction.deferReply();

        // --- WEEKOINS LEADERBOARD ---
        if (sub === 'weekoins') {
            const res = await db.query('SELECT username, weekoins FROM users ORDER BY weekoins DESC LIMIT 10');
            
            if (res.rows.length === 0) {
                return interaction.editReply('No players found in the database.');
            }

            const topString = res.rows.map((user, index) => {
                const rank = index + 1;
                let medal = '';
                if (rank === 1) medal = '🥇';
                else if (rank === 2) medal = '🥈';
                else if (rank === 3) medal = '🥉';
                else medal = `**#${rank}**`;

                return `${medal} **${user.username}** \n└ ${WEEKOIN_EMOJI} ${user.weekoins.toLocaleString()}`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 Richest Weekoo Players`)
                .setDescription(topString)
                .setFooter({ text: 'Money isn\'t everything... but it helps.' });

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'xp') {
            const res = await db.query('SELECT username, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10');

            if (res.rows.length === 0) {
                return interaction.editReply('No players found in the database.');
            }

            const topString = res.rows.map((user, index) => {
                const rank = index + 1;
                let medal = '';
                if (rank === 1) medal = '🥇';
                else if (rank === 2) medal = '🥈';
                else if (rank === 3) medal = '🥉';
                else medal = `**#${rank}**`;

                const level = user.level || 1;
                const currentXp = user.xp || 0;
                
                const lifetimeXp = getTotalXp(level, currentXp);

                return `${medal} **${user.username}** \n└ 🌟 Level ${level}  (Total: ${lifetimeXp.toLocaleString()} XP)`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🧠 Most Experienced Players`)
                .setDescription(topString)
                .setFooter({ text: 'Grind never stops.' });

            return interaction.editReply({ embeds: [embed] });
        }
    },
};