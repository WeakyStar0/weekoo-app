const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/db.js');
const { addXp } = require('../../utils/leveling.js');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startBattle(interaction, playerStats, enemy) {
    let pHP = playerStats.maxHp;
    let eHP = enemy.hp;
    let parryActive = false;
    let nextAttackBonus = 1.0;
    let battleLog = `A wild **${enemy.name}** appeared!`;

    // Pre-calculate the "Stakes" (The amount to win OR lose)
    const coinStakes = Math.floor(Math.random() * (enemy.coin_drop_max - enemy.coin_drop_min + 1)) + enemy.coin_drop_min;

    const generateEmbed = (lastAction = "") => {
        return new EmbedBuilder()
            .setColor('#cc0000')
            .setTitle(`⚔️ Battle: ${interaction.user.username} vs ${enemy.name}`)
            .setThumbnail(enemy.image_url)
            .setDescription(`${lastAction}\n\n**${enemy.name}**\n❤️ HP: \`${eHP}/${enemy.hp}\` | 🛡️ DEF: \`${enemy.defense}\`\n\n**You**\n❤️ HP: \`${pHP}/${playerStats.maxHp}\` | 🛡️ DEF: \`${playerStats.totalDef}\``)
            .setFooter({ text: `Stakes: 🪙 ${coinStakes} Weekoins` });
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('Attack').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('def').setLabel('Defend').setStyle(ButtonStyle.Primary)
    );

    const msg = await interaction.editReply({ embeds: [generateEmbed(battleLog)], components: [row] });

    while (pHP > 0 && eHP > 0) {
        const i = await msg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 }).catch(() => null);
        
        if (!i) return interaction.editReply({ content: "You fled from battle!", embeds: [], components: [] });

        let playerTurnMsg = "";
        let enemyTurnMsg = "";

        // --- PLAYER TURN ---
        if (i.customId === 'atk') {
            const damageDealt = Math.floor((playerStats.totalDmg * nextAttackBonus) * (100 / (enemy.defense + 100)));
            eHP -= damageDealt;
            playerTurnMsg = `⚔️ You hit **${enemy.name}** for **${damageDealt}** damage!`;
            nextAttackBonus = 1.0;
        } else {
            playerTurnMsg = `🛡️ You took a defensive stance...`;
            if (Math.random() < 0.15) {
                parryActive = true;
                playerTurnMsg += `\n✨ **PARRY READY!**`;
            }
        }

        if (eHP <= 0) break;

        await i.update({ embeds: [generateEmbed(playerTurnMsg)], components: [] });
        await wait(1500);

        // --- ENEMY TURN ---
        if (parryActive) {
            enemyTurnMsg = `✨ You parried the **${enemy.name}**'s attack! No damage taken.`;
            nextAttackBonus = 1.3;
            parryActive = false;
        } else {
            let enemyRawDmg = enemy.damage;
            if (i.customId === 'def') enemyRawDmg *= 0.5;
            const damageTaken = Math.floor(enemyRawDmg * (100 / (playerStats.totalDef + 100)));
            pHP -= damageTaken;
            enemyTurnMsg = `💥 **${enemy.name}** dealt **${damageTaken}** damage to you!`;
        }

        if (pHP <= 0) break;
        
        await interaction.editReply({ embeds: [generateEmbed(enemyTurnMsg)], components: [row] });
    }

    // --- RESOLUTION ---
    if (eHP <= 0) {
        // WIN LOGIC
        await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [coinStakes, interaction.user.id]);
        await addXp(interaction.user.id, enemy.xp_drop, interaction);
        
        return interaction.editReply({ 
            embeds: [new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🏆 Victory!')
                .setDescription(`You defeated **${enemy.name}**!\n\n**Rewards:**\n<:weekoin:1465807554927132883> +${coinStakes}\n🧪 +${enemy.xp_drop} XP`)
            ],
            components: [] 
        });
    } else {
        // LOSS LOGIC
        // Deduct the coins that the player was supposed to win
        await db.query('UPDATE users SET weekoins = GREATEST(0, weekoins - $1) WHERE discord_id = $2', [coinStakes, interaction.user.id]);

        return interaction.editReply({ 
            embeds: [new EmbedBuilder()
                .setColor('#000000')
                .setTitle('💀 Defeat')
                .setDescription(`You were slain by **${enemy.name}**...\n\n**Penalty:**\n<:weekoin:1465807554927132883> -${coinStakes} Weekoins`)
            ],
            components: [] 
        });
    }
}

module.exports = { startBattle };