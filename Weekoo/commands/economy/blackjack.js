const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const db = require('../../utils/db');

const activeChannels = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Challenge Weekoo to a game of Blackjack!'),

    async execute(interaction) {
        const channelId = interaction.channel.id;

        if (activeChannels.has(channelId)) {
            return interaction.reply({
                content: "I'm already dealing a hand in this channel. Wait your turn!",
                flags: [MessageFlags.Ephemeral]
            });
        }

        activeChannels.add(channelId);

        // --- LOBBY PHASE ---
        let lobbyLeader = null;
        const players = new Map(); // Store: id -> { username, bet }

        const getLobbyEmbed = () => {
            const playerList = players.size > 0
                ? Array.from(players.values()).map((p, i) => `${i === 0 ? '👑' : '•'} **${p.username}** (🪙 ${p.bet})`).join('\n')
                : '_No one yet..._';

            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('♠️ Weekoo’s Blackjack Table')
                .setDescription("I'm ready to deal. Who's brave enough to join? (60s remaining)")
                .addFields({ name: 'Players in Lobby', value: playerList })
                .setFooter({ text: lobbyLeader ? `Leader: ${players.get(lobbyLeader).username}` : "Waiting for a leader..." });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_join').setLabel('Join').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('bj_leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('bj_start').setLabel('Start Now').setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({ embeds: [getLobbyEmbed()], components: [row] });

        const lobbyCollector = response.createMessageComponentCollector({ time: 60000 });

        lobbyCollector.on('collect', async i => {
            // --- JOIN LOGIC ---
            // --- JOIN LOGIC ---
            if (i.customId === 'bj_join') {
                if (players.has(i.user.id)) return i.reply({ content: "You're already seated.", flags: [MessageFlags.Ephemeral] });

                // If the leader already started the game, don't show the modal
                if (lobbyCollector.ended) return i.reply({ content: "The game is already starting!", flags: [MessageFlags.Ephemeral] });

                const modal = new ModalBuilder().setCustomId(`bj_modal_${i.user.id}`).setTitle('Place Your Bet');
                const betInput = new TextInputBuilder()
                    .setCustomId('bet_amount').setLabel('Weekoins to bet').setStyle(TextInputStyle.Short)
                    .setPlaceholder('Min: 10').setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(betInput));
                await i.showModal(modal);

                // Wait for modal submission
                const submitted = await i.awaitModalSubmit({ time: 45000, filter: m => m.customId === `bj_modal_${i.user.id}` }).catch(() => null);

                if (submitted) {
                    // 1. IMMEDIATELY defer the reply to prevent "InteractionAlreadyReplied" or timeout
                    await submitted.deferReply({ flags: [MessageFlags.Ephemeral] });

                    try {
                        const bet = parseInt(submitted.fields.getTextInputValue('bet_amount'));
                        const userRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [i.user.id]);
                        const balance = userRes.rows[0]?.weekoins || 0;

                        if (isNaN(bet) || bet < 10 || balance < bet) {
                            return await submitted.editReply({ content: "Invalid bet or insufficient funds." });
                        }

                        // Check if lobby ended while they were typing
                        if (lobbyCollector.ended) {
                            return await submitted.editReply({ content: "Too late! The game has already started." });
                        }

                        players.set(i.user.id, { username: i.user.username, bet, hand: [], status: 'Playing' });
                        if (!lobbyLeader) lobbyLeader = i.user.id;

                        await interaction.editReply({ embeds: [getLobbyEmbed()] });
                        await submitted.editReply({ content: `You've joined with 🪙 ${bet}!` });

                    } catch (err) {
                        console.error("Error in modal processing:", err);
                        if (!submitted.replied) {
                            await submitted.editReply({ content: "There was an error processing your bet." });
                        }
                    }
                }
            }
            // --- LEAVE LOGIC ---
            if (i.customId === 'bj_leave') {
                if (!players.has(i.user.id)) return i.reply({ content: "You aren't even at the table.", flags: [MessageFlags.Ephemeral] });

                players.delete(i.user.id);
                if (lobbyLeader === i.user.id) {
                    lobbyLeader = players.size > 0 ? Array.from(players.keys())[0] : null;
                }

                await i.update({ embeds: [getLobbyEmbed()] });
            }

            // --- START NOW LOGIC ---
            if (i.customId === 'bj_start') {
                if (i.user.id !== lobbyLeader) {
                    return i.reply({ content: "Only the lobby leader can start the game early.", flags: [MessageFlags.Ephemeral] });
                }
                lobbyCollector.stop('manual_start');
            }
        });

        lobbyCollector.on('end', (collected, reason) => {
            if (players.size === 0) {
                activeChannels.delete(channelId);
                return interaction.editReply({ content: "No one joined. Table closed.", embeds: [], components: [] });
            }
            runGame(interaction, players, channelId);
        });
    },
};

async function runGame(interaction, players, channelId) {
    // --- MONEY DEDUCTION PHASE ---
    // Now that the game is ACTUALLY starting, we deduct the coins.
    for (const [id, p] of players) {
        const userRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [id]);
        const balance = userRes.rows[0]?.weekoins || 0;

        if (balance < p.bet) {
            // If they spent their money during the 60s lobby, kick them.
            players.delete(id);
            continue;
        }
        await db.query('UPDATE users SET weekoins = weekoins - $1 WHERE discord_id = $2', [p.bet, id]);
    }

    if (players.size === 0) {
        activeChannels.delete(channelId);
        return interaction.editReply({ content: "The game couldn't start because no one had enough coins left!", embeds: [], components: [] });
    }

    const deck = createDeck();
    const dealer = { hand: [], total: 0 };

    dealer.hand.push(deck.pop(), deck.pop());
    for (const p of players.values()) p.hand.push(deck.pop(), deck.pop());

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.editReply({
        embeds: [renderTable(players, dealer, false)],
        components: [controls]
    });

    const collector = msg.createMessageComponentCollector({ idle: 30000 }); // Increased timeout to 30s

    collector.on('collect', async i => {
        const p = players.get(i.user.id);
        if (!p || p.status !== 'Playing') return i.reply({ content: "You can't do that right now.", flags: [MessageFlags.Ephemeral] });

        if (i.customId === 'bj_hit') {
            p.hand.push(deck.pop());
            if (calculate(p.hand) > 21) p.status = 'Bust';
        } else {
            p.status = 'Stand';
        }

        if (Array.from(players.values()).every(p => p.status !== 'Playing')) {
            collector.stop();
        } else {
            await i.update({ embeds: [renderTable(players, dealer, false)] });
        }
    });

    collector.on('end', async () => {
        let dScore = calculate(dealer.hand);
        while (dScore < 17) {
            dealer.hand.push(deck.pop());
            dScore = calculate(dealer.hand);
        }

        const summary = [];
        for (const [id, p] of players) {
            const pScore = calculate(p.hand);
            let win = 0;
            let note = '';

            if (pScore > 21) note = 'Bust ❌';
            else if (dScore > 21 || pScore > dScore) {
                if (pScore === 21 && p.hand.length === 2) {
                    note = 'Blackjack! ✨';
                    win = Math.floor(p.bet * 2.5);
                } else {
                    note = 'Win 🏆';
                    win = p.bet * 2;
                }
            } else if (pScore === dScore) {
                note = 'Push 🤝';
                win = p.bet;
            } else note = 'Lost 💀';

            if (win > 0) await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [win, id]);
            summary.push(`**${p.username}**: ${note} ${win > 0 ? `(+🪙${win})` : ''}`);
        }

        const finalEmbed = renderTable(players, dealer, true);
        finalEmbed.addFields({ name: 'Outcome', value: summary.join('\n') });
        finalEmbed.setDescription("I've finished my hand. Here's how you all did.");

        await interaction.editReply({ embeds: [finalEmbed], components: [] });
        activeChannels.delete(channelId);
    });
}

// --- HELPERS ---

function createDeck() {
    const s = ['♠️', '♥️', '♦️', '♣️'], v = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return s.flatMap(suit => v.map(name => ({ name, suit }))).sort(() => Math.random() - 0.5);
}

function calculate(hand) {
    let val = 0, aces = 0;
    for (const c of hand) {
        if (c.name === 'A') aces++;
        else val += (['J', 'Q', 'K'].includes(c.name) ? 10 : parseInt(c.name));
    }
    for (let i = 0; i < aces; i++) val += (val + 11 <= 21 ? 11 : 1);
    return val;
}

function renderTable(players, dealer, reveal) {
    const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🃏 Weekoo’s Deal');

    const dCards = reveal
        ? dealer.hand.map(c => `[${c.name}${c.suit}]`).join(' ') + ` \n**Total: ${calculate(dealer.hand)}**`
        : `[${dealer.hand[0].name}${dealer.hand[0].suit}] [??]`;
    embed.addFields({ name: '<:konata_think:1465824984512332023> Dealer Hand', value: dCards, inline: false });

    for (const p of players.values()) {
        const cards = p.hand.map(c => `[${c.name}${c.suit}]`).join(' ');
        const score = calculate(p.hand);
        embed.addFields({
            name: `${p.username} (${p.status})`,
            value: `${cards}\n**Total: ${score}**`,
            inline: true
        });
    }
    return embed;
}