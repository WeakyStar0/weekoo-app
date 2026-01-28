const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const db = require('../../utils/db');

const activeChannels = new Set();
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const RED_NUMS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const getColor = (n) => (n === 0 ? '🟩' : (RED_NUMS.includes(n) ? '🟥' : '⬛'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Start a simplified multiplayer Roulette table.'),

    async execute(interaction) {
        const channelId = interaction.channel.id;
        if (activeChannels.has(channelId)) {
            return interaction.reply({ content: "The wheel is already spinning here!", flags: [MessageFlags.Ephemeral] });
        }

        activeChannels.add(channelId);
        let lobbyLeader = null;
        const players = new Map();

        const getLobbyEmbed = () => {
            const list = players.size > 0 
                ? Array.from(players.values()).map((p, i) => `${i === 0 ? '👑' : '•'} **${p.username}**: 🪙${p.bet} on \`${p.choice}\``).join('\n')
                : '_No one yet..._';

            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🎡 Weekoo’s Roulette')
                .setDescription("**How to Bet:**\nJoin and type your choice: `red`, `black`, `green`, `even`, `odd`, or a number `0-36`.")
                .addFields({ name: 'Players', value: list })
                .setFooter({ text: "The house always wins... eventually." });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('roul_join').setLabel('Join/Bet').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('roul_leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('roul_start').setLabel('Start Now').setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({ embeds: [getLobbyEmbed()], components: [row] });
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'roul_join') {
                const modal = new ModalBuilder().setCustomId(`rm_${i.user.id}`).setTitle('Place Your Bet');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amt').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('choice').setLabel('Choice (Color, Even/Odd, or Number)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 45000, filter: m => m.customId === `rm_${i.user.id}` }).catch(() => null);
                if (!submitted) return;

                await submitted.deferReply({ flags: [MessageFlags.Ephemeral] });

                const amt = parseInt(submitted.fields.getTextInputValue('amt'));
                const choice = submitted.fields.getTextInputValue('choice').toLowerCase().trim();
                const userRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [i.user.id]);
                const balance = userRes.rows[0]?.weekoins || 0;

                // Simple validation
                const validChoices = ['red', 'black', 'green', 'zero', 'even', 'odd'];
                const isNumber = !isNaN(choice) && parseInt(choice) >= 0 && parseInt(choice) <= 36;

                if (isNaN(amt) || amt < 10 || balance < amt || (!validChoices.includes(choice) && !isNumber)) {
                    return submitted.editReply("Invalid bet! Check your amount/choice.");
                }

                players.set(i.user.id, { username: i.user.username, bet: amt, choice });
                if (!lobbyLeader) lobbyLeader = i.user.id;
                await interaction.editReply({ embeds: [getLobbyEmbed()] });
                await submitted.editReply(`Bet accepted: 🪙${amt} on ${choice}`);
            }

            if (i.customId === 'roul_leave') {
                players.delete(i.user.id);
                if (lobbyLeader === i.user.id) lobbyLeader = Array.from(players.keys())[0] || null;
                await i.update({ embeds: [getLobbyEmbed()] });
            }

            if (i.customId === 'roul_start' && i.user.id === lobbyLeader) collector.stop();
        });

        collector.on('end', () => {
            if (players.size === 0) {
                activeChannels.delete(channelId);
                return interaction.editReply({ content: "Game cancelled (No players).", embeds: [], components: [] });
            }
            runGame(interaction, players, channelId);
        });
    }
};

async function runGame(interaction, players, channelId) {
    // 1. DEDUCTION
    for (const [id, p] of players) {
        await db.query('UPDATE users SET weekoins = weekoins - $1 WHERE discord_id = $2', [p.bet, id]);
    }

    const result = Math.floor(Math.random() * 37);
    const winIndex = WHEEL_ORDER.indexOf(result);

    const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('<:konata_think:1465824984512332023> Spinning the wheel...');

    // 2. ANIMATION
    for (let i = 8; i >= 0; i--) {
        const center = (WHEEL_ORDER.indexOf(result) - i + 37) % 37;
        const slice = [];
        for (let j = -2; j <= 2; j++) {
            const num = WHEEL_ORDER[(center + j + 37) % 37];
            slice.push(`[${num}${getColor(num)}]`);
        }
        embed.setDescription(`**${slice.join(' ')}**\n\`     ▲     \`\n\n*The ball is rolling...*`);
        await interaction.editReply({ embeds: [embed], components: [] });
        await wait(950);
    }

    // 3. CALCULATION
    const summary = [];
    for (const [id, p] of players) {
        let won = false;
        let payout = 0;

        // Choice Logic
        const isGreen = p.choice === 'green' || p.choice === 'zero' || p.choice === '0';
        
        if (isGreen && result === 0) {
            won = true; payout = p.bet * 36;
        } else if (p.choice === 'red' && RED_NUMS.includes(result)) {
            won = true; payout = p.bet * 2;
        } else if (p.choice === 'black' && !RED_NUMS.includes(result) && result !== 0) {
            won = true; payout = p.bet * 2;
        } else if (p.choice === 'even' && result !== 0 && result % 2 === 0) {
            won = true; payout = p.bet * 2;
        } else if (p.choice === 'odd' && result !== 0 && result % 2 !== 0) {
            won = true; payout = p.bet * 2;
        } else if (!isNaN(p.choice) && parseInt(p.choice) === result) {
            won = true; payout = p.bet * 36;
        }

        if (won) {
            await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [payout, id]);
            summary.push(`• **${p.username}**: Won **🪙${payout.toLocaleString()}**!`);
        } else {
            summary.push(`• **${p.username}**: Lost.`);
        }
    }

    const finalEmbed = new EmbedBuilder()
        .setColor(result === 0 ? '#00FF00' : (RED_NUMS.includes(result) ? '#FF0000' : '#111111'))
        .setTitle(`🎡 Result: ${result} ${getColor(result)}`)
        .setDescription(summary.join('\n') || "House wins.")
        .setFooter({ text: "Weekoo: 'Thanks for the donations!'" });

    await interaction.editReply({ embeds: [finalEmbed] });
    activeChannels.delete(channelId);
}