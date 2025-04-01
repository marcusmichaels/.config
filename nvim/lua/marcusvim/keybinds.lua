-- Variables
local g = vim.g
local o = vim.o

local function map(m, k, v)
    vim.keymap.set(m, k, v, { silent = true })
end

local builtin = require('telescope.builtin')

-- Map <leader> to space
g.mapleader = ' '
g.maplocalleader = ' '

-- leader-o/O inserts blank line below/above
map('n', '<leader>o', 'o<ESC>')
map('n', '<leader>O', 'O<ESC>')

-- Telescope CLI sugar
map('n', '<leader>ff', builtin.find_files, {})
map('n', '<leader>faf', function() builtin.find_files({no_ignore = true}) end, {})
map('n', '<leader>fg', builtin.live_grep, {})
map('n', '<leader>fb', builtin.buffers, {})
map('n', '<leader>fh', builtin.help_tags, {})
