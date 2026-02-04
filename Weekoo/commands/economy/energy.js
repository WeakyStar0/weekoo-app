const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('energy')
        .setDescription('Check your current energy and time until the next reset.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const MAX_ENERGY = 100;
        const COOLDOWN = 60 * 60 * 1000;

        try {
            const res = await db.query('SELECT energy, last_energy_reset FROM users WHERE discord_id = $1', [userId]);

            let currentEnergy;
            let timeString;

            if (res.rows.length === 0) {
                currentEnergy = MAX_ENERGY;
                timeString = 'Ready now!';
            } else {
                const { energy, last_energy_reset } = res.rows[0];
                const now = new Date();
                const lastReset = new Date(last_energy_reset);
                const timePassed = now - lastReset;

                if (timePassed >= COOLDOWN) {
                    currentEnergy = MAX_ENERGY;
                    timeString = 'Ready to reset!';
                } else {
                    currentEnergy = energy;
                    const remaining = COOLDOWN - timePassed;

                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    timeString = `${hours}h ${minutes}m`;
                }
            }

            const percentage = currentEnergy / MAX_ENERGY;
            const filledBlocks = Math.round(percentage * 10);
            const emptyBlocks = 10 - filledBlocks;
            const bar = '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);

            const embed = new EmbedBuilder()
                .setColor('#FFFF00')
                .setTitle('⚡ Your Energy')
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: 'Current Energy', value: `${bar} \`${currentEnergy} / ${MAX_ENERGY}\``, inline: false },
                    { name: 'Time Until Full Reset', value: `\`${timeString}\``, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error('Energy command error:', error);
            await interaction.reply({ content: 'Could not fetch your energy status.', flags: [MessageFlags.Ephemeral] });
        }
    },
};