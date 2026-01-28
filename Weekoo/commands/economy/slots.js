const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const db = require('../../utils/db');

// Tracks active players to prevent multiple games
const activeGames = new Set();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the animated Weekoo Slot Machine!')
        .addIntegerOption(option => 
            option.setName('bet')
                .setDescription('The amount of Weekoins you want to bet')
                .setMinValue(10) // Set a minimum bet
                .setRequired(false)), // Default will be 100 if not provided

    async execute(interaction) {
        const userId = interaction.user.id;
        // Get bet from options or default to 100
        const bet = interaction.options.getInteger('bet') || 100;

        // 1. CONCURRENCY CHECK
        if (activeGames.has(userId)) {
            return interaction.reply({
                content: '❌ You already have an active slot machine! Finish that game or wait for it to expire.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 2. INITIAL BALANCE CHECK
        const initialRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [userId]);
        const initialBalance = initialRes.rows[0]?.weekoins || 0;

        if (initialBalance < bet) {
            return interaction.reply({ 
                content: `❌ You don't have enough Weekoins to bet **${bet}**. Your balance is **${initialBalance}**.`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        const STATIC_ICON = '⬛';
        activeGames.add(userId);

        const startEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎰 Weekoo Slot Machine')
            .setDescription(`**[ ${STATIC_ICON} | ${STATIC_ICON} | ${STATIC_ICON} ]**\n\nClick below to spin with a bet of **${bet}**!`)
            .addFields(
                { name: 'Paytable', value: `🍒🍒🍒: ${bet * 2}\n🔔🔔🔔: ${bet * 4}\n⭐⭐⭐: ${bet * 8}\n💎💎💎: ${bet * 50}`, inline: true }
            )
            .setFooter({ text: `Current Bet: ${bet} Weekoins` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('spin_button')
                .setLabel(`🎰 Spin (${bet})`)
                .setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({ embeds: [startEmbed], components: [row] });

        // 15s idle timer (resets every time they spin)
        const collector = response.createMessageComponentCollector({
            idle: 15000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                return i.reply({ content: "Start your own game with /slots!", flags: [MessageFlags.Ephemeral] });
            }

            try {
                // Re-check balance for every spin
                const userRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [userId]);
                const balance = userRes.rows[0]?.weekoins || 0;

                if (balance < bet) {
                    await i.reply({ content: `❌ You ran out of coins for a **${bet}** bet!`, flags: [MessageFlags.Ephemeral] });
                    return collector.stop('out_of_money');
                }

                const reel = [
                    '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', // 50%
                    '🔔', '🔔', '🔔', '🔔', '🔔', '🔔',                   // 30%
                    '⭐', '⭐', '⭐',                                     // 15%
                    '💎'                                              // 5%
                ]; 
                
                const finalResult = [
                    reel[Math.floor(Math.random() * reel.length)],
                    reel[Math.floor(Math.random() * reel.length)],
                    reel[Math.floor(Math.random() * reel.length)]
                ];

                // Deduct bet
                await db.query('UPDATE users SET weekoins = weekoins - $1 WHERE discord_id = $2', [bet, userId]);

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('spin_button').setLabel('🎰 Spinning...').setStyle(ButtonStyle.Primary).setDisabled(true)
                );

                await i.update({
                    embeds: [new EmbedBuilder().setColor('#FFFF00').setTitle('🎰 SPINNING...').setDescription(`**[ 🔄 | 🔄 | 🔄 ]**`)],
                    components: [disabledRow]
                });

                await wait(1200);
                await i.editReply({ embeds: [new EmbedBuilder().setColor('#FFFF00').setTitle('🎰 SPINNING...').setDescription(`**[ ${finalResult[0]} | 🔄 | 🔄 ]**`)] });
                await wait(1000);
                await i.editReply({ embeds: [new EmbedBuilder().setColor('#FFFF00').setTitle('🎰 SPINNING...').setDescription(`**[ ${finalResult[0]} | ${finalResult[1]} | 🔄 ]**`)] });
                await wait(1000);

                // Multiplier Logic
                let winnings = 0;
                let isJackpot = false;
                if (finalResult[0] === finalResult[1] && finalResult[1] === finalResult[2]) {
                    const icon = finalResult[0];
                    if (icon === '🍒') winnings = bet * 2;
                    else if (icon === '🔔') winnings = bet * 4;
                    else if (icon === '⭐') winnings = bet * 8;
                    else if (icon === '💎') { 
                        winnings = bet * 50; 
                        isJackpot = true; 
                    }
                }

                if (winnings > 0) {
                    await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [winnings, userId]);
                    if (isJackpot) await db.query('UPDATE users SET jackpots_won = jackpots_won + 1 WHERE discord_id = $1', [userId]);
                }

                const finalBalanceRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [userId]);
                const finalBalance = finalBalanceRes.rows[0].weekoins;

                const finalEmbed = new EmbedBuilder()
                    .setColor(winnings > 0 ? '#00FF00' : '#FF0000')
                    .setTitle(isJackpot ? '💎 JACKPOT! 💎' : '🎰 Results')
                    .setDescription(`**[ ${finalResult[0]} | ${finalResult[1]} | ${finalResult[2]} ]**\n\n${winnings > 0 ? `<a:konata_hype:1465824990556327937> You won **${winnings}** Weekoins!` : 'Better luck next time! <a:konata_yawn:1465824993945321695>'
                        }`)
                    .setFooter({ text: `Balance: ${finalBalance.toLocaleString()} Weekoins • 15s to spin again` });

                const enabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('spin_button').setLabel(`🎰 Spin Again (${bet})`).setStyle(ButtonStyle.Primary)
                );

                await i.editReply({ embeds: [finalEmbed], components: [enabledRow] });

            } catch (error) {
                console.error(error);
                activeGames.delete(userId);
                collector.stop();
            }
        });

        collector.on('end', async () => {
            activeGames.delete(userId);
            try {
                // Remove buttons when session expires
                await interaction.editReply({ components: [] });
            } catch (err) {
                // Handle case where message was deleted
            }
        });
    },
};