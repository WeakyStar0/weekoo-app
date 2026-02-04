// Define Emojis
const EMOJIS = {
    // 🏃 MOVING
    PLAYER_WALK: '<a:kirby_walk:1468292617254211750>',
    // ⛏️ DRILLING
    PLAYER_DRILL: '<a:kirby_mine:1468292614565396583>', 
    // 🛑 IDLE
    PLAYER_IDLE: '<a:kirby_dance:1468298440101331015>', 

    SKY: '<:empty_emoji:1468293846491463874>',

    // DIMENSION BLOCKS
    Overworld: { 
        TOP: '<:block_grass:1468277009124688127>', 
        BOT: '<:block_dirt:1468275701680443557>',
        STONE: '<:block_stone:1468275695632384090>'
    },
    Nether: { 
        TOP: '<:block_netherrack:1468275696915845345>', 
        BOT: '<:block_netherrack:1468275696915845345>',
        STONE: '<:block_netherrack:1468275696915845345>'
    }, 
    'The End': { 
        TOP: '<:block_end_stone:1468275703350038633>', 
        BOT: '<:block_end_stone:1468275703350038633>',
        STONE: '<:block_end_stone:1468275703350038633>'
    },
    Frostveil: { 
        TOP: '<:block_snow:1468389185026265179>', 
        BOT: '<:block_ice:1468389183578968124>',
        STONE: '<:block_ice:1468389183578968124>'
    },
    Faywood: { 
        TOP: '🍃', 
        BOT: '🪵',
        STONE: '🌿'
    }
};

/**
 * Walking Animation
 */
function getWalkingScene(dimensionName, isMoving = true) {
    const dim = EMOJIS[dimensionName] || EMOJIS['Overworld'];
    const playerSprite = isMoving ? EMOJIS.PLAYER_WALK : EMOJIS.PLAYER_IDLE;

    const row1 = EMOJIS.SKY.repeat(7);
    const row2 = `${EMOJIS.SKY.repeat(3)}${playerSprite}${EMOJIS.SKY.repeat(3)}`;
    const row3 = dim.TOP.repeat(7);
    const row4 = dim.BOT.repeat(7);

    return `${row1}\n${row2}\n${row3}\n${row4}`;
}

/**
 * Mining Animation
 * @param {string} dimensionName 
 * @param {number} frame - 0, 1, or 2 (Depth)
 * @param {boolean} isDrilling - True = Animation, False = Idle/Result
 */
function getMiningScene(dimensionName, frame, isDrilling = true) {
    const dim = EMOJIS[dimensionName] || EMOJIS['Overworld'];
    
    // 1. Select Block Type: Use the new STONE property
    const BLOCK = dim.STONE; 
    const SKY = EMOJIS.SKY;
    
    // 2. Select Player Sprite
    const PLAYER = isDrilling ? EMOJIS.PLAYER_DRILL : EMOJIS.PLAYER_IDLE;

    // Helpers
    const solidRow = (emoji) => emoji.repeat(7);
    const playerRow = (bgEmoji) => `${bgEmoji.repeat(3)}${PLAYER}${bgEmoji.repeat(3)}`;

    // Frame 0: Surface (Player on top of stone)
    if (frame === 0) {
        return `${playerRow(BLOCK)}\n${solidRow(BLOCK)}\n${solidRow(BLOCK)}\n${solidRow(BLOCK)}`;
    }
    
    // Frame 1: Digging (Sky appears above)
    if (frame === 1) {
        return `${solidRow(SKY)}\n${playerRow(BLOCK)}\n${solidRow(BLOCK)}\n${solidRow(BLOCK)}`;
    }

    // Frame 2: Deep (Deep inside)
    if (frame === 2) {
        return `${solidRow(SKY)}\n${solidRow(SKY)}\n${playerRow(BLOCK)}\n${solidRow(BLOCK)}`;
    }

    return "Error generating scene";
}

module.exports = { getWalkingScene, getMiningScene };