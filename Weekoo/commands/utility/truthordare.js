const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const axios = require('axios');

// Tracks who is currently being challenged
const activeGames = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('truthordare')
        .setDescription('Challenge someone to a game of Truth or Dare.')
        .addStringOption(option =>
            option.setName('rating')
                .setDescription('The intensity of the questions.')
                .setRequired(true) // <-- Required (Now first)
                .addChoices(
                    { name: 'PG (Safe for Everyone)', value: 'pg' },
                    { name: 'PG-13 (Teens)', value: 'pg13' },
                    { name: 'R (Adults Only)', value: 'r' }
                ))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The person you want to challenge.')), // <-- Optional (Now second)

    async execute(interaction) {
        const challenger = interaction.user;
        const target = interaction.options.getUser('target') || challenger;
        const rating = interaction.options.getString('rating');

        if (activeGames.has(target.id)) {
            return interaction.reply({
                content: "That person is already in a game! Wait for them to finish.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        activeGames.add(target.id);

        try {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚖️ Truth or Dare')
                .setDescription(`**${challenger.username}** has challenged **${target.username}**!\n\n${target.username}, the choice is yours...`)
                .setFooter({ text: `Rating: ${rating.toUpperCase()}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('truth_button')
                    .setLabel('Truth')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('dare_button')
                    .setLabel('Dare')
                    .setStyle(ButtonStyle.Danger)
            );

            const response = await interaction.reply({
                content: `<@${target.id}>, you have been challenged!`,
                embeds: [embed],
                components: [row]
            });

            const collector = response.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async i => {
                // Only the challenged user can interact
                if (i.user.id !== target.id) {
                    return i.reply({ content: "This is not your challenge!", flags: [MessageFlags.Ephemeral] });
                }

                const choice = i.customId.startsWith('truth') ? 'truth' : 'dare';

                try {
                    // Fetch from the API
                    const apiResponse = await axios.get(`https://api.truthordarebot.xyz/v1/${choice}?rating=${rating}`);
                    const question = apiResponse.data.question;

                    const resultEmbed = new EmbedBuilder()
                        .setColor(choice === 'truth' ? '#3498DB' : '#E74C3C')
                        .setTitle(choice === 'truth' ? '😇 TRUTH' : '😈 DARE')
                        .setDescription(question)
                        .setFooter({ text: `Weekoo: "Don't back down now, ${target.username}!"` });

                    // End the game by removing buttons
                    await i.update({ embeds: [resultEmbed], components: [] });
                    collector.stop('answered');

                } catch (apiError) {
                    console.error("Truth or Dare API Error:", apiError);
                    await i.update({ content: "I couldn't think of a good question... try again.", components: [], embeds: [] });
                    collector.stop('api_error');
                }
            });

            collector.on('end', async (collected, reason) => {
                // Free up the user to be challenged again
                activeGames.delete(target.id);

                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('t').setLabel('Truth').setStyle(ButtonStyle.Success).setDisabled(true),
                        new ButtonBuilder().setCustomId('d').setLabel('Dare').setStyle(ButtonStyle.Danger).setDisabled(true)
                    );
                    await interaction.editReply({
                        content: `${target.username} was too scared to choose...`,
                        embeds: [],
                        components: [disabledRow]
                    });
                }
            });

        } catch (error) {
            console.error(error);
            activeGames.delete(target.id);
            await interaction.reply({ content: "Something went wrong setting up the game.", flags: [MessageFlags.Ephemeral] });
        }
    },
};