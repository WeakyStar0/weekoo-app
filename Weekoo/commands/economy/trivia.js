const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');
const axios = require('axios');
const he = require('he');
const db = require('../../utils/db');

const activeGames = new Set();

const CATEGORIES = {
    'any': '',
    'general': 9,
    'books': 10,
    'film': 11,
    'music': 12,
    'video_games': 15,
    'computers': 18,
    'science': 17,
    'mythology': 20,
    'sports': 21,
    'geography': 22,
    'history': 23,
    'anime': 31,
    'cartoons': 32
};

const REWARDS = {
    'easy': 50,
    'medium': 100,
    'hard': 200
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Answer a trivia question to earn Weekoins!')
        .addStringOption(option => 
            option.setName('category')
                .setDescription('Select a topic')
                .setRequired(true)
                .addChoices(
                    { name: '🎲 Any/Random', value: 'any' },
                    { name: '🧠 General Knowledge', value: 'general' },
                    { name: '🎮 Video Games', value: 'video_games' },
                    { name: '⛩️ Anime & Manga', value: 'anime' },
                    { name: '🎬 Film', value: 'film' },
                    { name: '🎵 Music', value: 'music' },
                    { name: '💻 Computers', value: 'computers' },
                    { name: '🧪 Science', value: 'science' },
                    { name: '🌍 Geography', value: 'geography' },
                    { name: '📜 History', value: 'history' }
                ))
        .addStringOption(option => 
            option.setName('difficulty')
                .setDescription('Select difficulty')
                .setRequired(true)
                .addChoices(
                    { name: 'Easy (50 coins)', value: 'easy' },
                    { name: 'Medium (100 coins)', value: 'medium' },
                    { name: 'Hard (200 coins)', value: 'hard' }
                )),

    async execute(interaction) {
        const userId = interaction.user.id;
        const selectedCategory = interaction.options.getString('category');
        const selectedDifficulty = interaction.options.getString('difficulty');

        if (activeGames.has(userId)) {
            return interaction.reply({ 
                content: "Finish your current question first!", 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        activeGames.add(userId);
        await interaction.deferReply();

        try {
            let url = `https://opentdb.com/api.php?amount=1&type=multiple&difficulty=${selectedDifficulty}`;
            if (selectedCategory !== 'any') {
                url += `&category=${CATEGORIES[selectedCategory]}`;
            }

            const response = await axios.get(url);
            
            if (response.data.response_code !== 0 || response.data.results.length === 0) {
                activeGames.delete(userId);
                return interaction.editReply("Could not find a question with that specific combination. Try a different category or difficulty.");
            }

            const data = response.data.results[0];
            
            // --- FIX IS HERE: Decode the category name too! ---
            const categoryName = he.decode(data.category);
            const question = he.decode(data.question);
            const correctAnswer = he.decode(data.correct_answer);
            const incorrectAnswers = data.incorrect_answers.map(a => he.decode(a));
            
            const reward = REWARDS[selectedDifficulty];
            const color = selectedDifficulty === 'hard' ? '#FF0000' : (selectedDifficulty === 'medium' ? '#FFA500' : '#00FF00');

            const allAnswers = [correctAnswer, ...incorrectAnswers].sort(() => Math.random() - 0.5);

            const embed = new EmbedBuilder()
                .setColor(color)
                // Use the cleaned category name here
                .setTitle(`📚 Trivia: ${categoryName}`) 
                .setDescription(`**${question}**\n\nDifficulty: **${selectedDifficulty.toUpperCase()}**\nWin: **+${reward}** | Fail: **-20**`)
                .setFooter({ text: "You have 30 seconds to answer." });

            const row = new ActionRowBuilder();
            allAnswers.forEach((answer, index) => {
                const btnLabel = answer.length > 80 ? answer.substring(0, 77) + '...' : answer;
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`trivia_${index}`)
                        .setLabel(btnLabel)
                        .setStyle(ButtonStyle.Secondary)
                );
            });

            const msg = await interaction.editReply({ embeds: [embed], components: [row] });

            const collector = msg.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async i => {
                if (i.user.id !== userId) {
                    return i.reply({ content: "This isn't your quiz!", flags: [MessageFlags.Ephemeral] });
                }

                const selectedIndex = parseInt(i.customId.split('_')[1]);
                const selectedAnswer = allAnswers[selectedIndex];
                const isCorrect = selectedAnswer === correctAnswer;

                const disabledRow = new ActionRowBuilder();
                allAnswers.forEach((ans, idx) => {
                    let style = ButtonStyle.Secondary;
                    if (ans === correctAnswer) style = ButtonStyle.Success; 
                    else if (idx === selectedIndex && !isCorrect) style = ButtonStyle.Danger; 

                    const btnLabel = ans.length > 80 ? ans.substring(0, 77) + '...' : ans;

                    disabledRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`disabled_${idx}`)
                            .setLabel(btnLabel)
                            .setStyle(style)
                            .setDisabled(true)
                    );
                });

                if (isCorrect) {
                    await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [reward, userId]);
                    embed.setColor('#00FF00').setFooter({ text: "Weekoo: 'Easy money!'" });
                    await i.update({ 
                        content: `✅ **Correct!** You won **${reward}** <:weekoin:1465807554927132883>.`, 
                        embeds: [embed], 
                        components: [disabledRow] 
                    });
                } else {
                    await db.query('UPDATE users SET weekoins = weekoins - 20 WHERE discord_id = $1', [userId]);
                    embed.setColor('#FF0000').setFooter({ text: "Weekoo: 'Embarrassing...'" });
                    await i.update({ 
                        content: `❌ **Wrong!** The correct answer was: **${correctAnswer}**\nYou lost **20** <:weekoin:1465807554927132883>.`, 
                        embeds: [embed], 
                        components: [disabledRow] 
                    });
                }
                collector.stop('answered');
            });

            collector.on('end', async (collected, reason) => {
                activeGames.delete(userId);
                
                if (reason === 'time') {
                    await db.query('UPDATE users SET weekoins = weekoins - 1 WHERE discord_id = $1', [userId]);
                    const disabledRow = new ActionRowBuilder();
                    allAnswers.forEach((ans, idx) => {
                        const btnLabel = ans.length > 80 ? ans.substring(0, 77) + '...' : ans;
                        let style = (ans === correctAnswer) ? ButtonStyle.Success : ButtonStyle.Secondary;
                        disabledRow.addComponents(new ButtonBuilder().setCustomId(`t_${idx}`).setLabel(btnLabel).setStyle(style).setDisabled(true));
                    });
                    
                    try {
                        await interaction.editReply({ content: "⏰ **Time's up!** You lost **1** <:weekoin:1465807554927132883>.", components: [disabledRow] });
                    } catch (e) {}
                }
            });

        } catch (error) {
            console.error('Trivia Error:', error);
            activeGames.delete(userId);
            await interaction.editReply("I couldn't find a question for that specific setup. Try a different category!");
        }
    },
};