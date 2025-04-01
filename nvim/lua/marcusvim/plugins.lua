local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  'neovim/nvim-lspconfig',
  "folke/which-key.nvim",
  { "folke/neoconf.nvim", cmd = "Neoconf" },
  "folke/neodev.nvim",
  { 'nvim-telescope/telescope.nvim', tag = '0.1.5', dependencies = { 'nvim-lua/plenary.nvim',  'sharkdp/fd', 'BurntSushi/ripgrep', }},
  { 'nvim-treesitter/nvim-treesitter' },
  { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
  { 'folke/tokyonight.nvim', lazy = false, priority = 1000, opts = {}},
  { 'lewis6991/gitsigns.nvim' },
})

require("telescope").setup({
  defaults = {
    --prompt_prefix = " ",
    --selection_caret = " ",
    path_display = {"smart"},
    dynamic_preview_title = true,
    --winblend = 10,
    sorting_strategy = "ascending",
    --layout_strategy = "vertical",
    layout_config = {
      prompt_position = "bottom",
      height = 0.95,
    },
    vimgrep_arguments = {
      'rg',
      '--color=never',
      '--no-heading',
      '--with-filename',
      '--line-number',
      '--column',
      '--smart-case',
      '-u'
    },
  },
  pickers = {
    live_grep = {
      file_ignore_patterns = { 'node_modules', '.git', '.venv' },
      additional_args = function(_)
        return { "--hidden" }
      end
    },
    find_files = {
      file_ignore_patterns = { 'node_modules', '.git', '.venv' },
      hidden = true
    }
  },
})

require('gitsigns').setup({
  signs = {
    add          = { text = '┃' },
    change       = { text = '┃' },
    delete       = { text = '_' },
    topdelete    = { text = '‾' },
    changedelete = { text = '~' },
    untracked    = { text = '┆' },
  },
  signcolumn = true,  -- Toggle with `:Gitsigns toggle_signs`
  numhl      = false, -- Toggle with `:Gitsigns toggle_numhl`
  linehl     = false, -- Toggle with `:Gitsigns toggle_linehl`
  word_diff  = false, -- Toggle with `:Gitsigns toggle_word_diff`
  watch_gitdir = {
    follow_files = true
  },
  auto_attach = true,
  attach_to_untracked = false,
  current_line_blame = true, -- Toggle with `:Gitsigns toggle_current_line_blame`
  current_line_blame_opts = {
    virt_text = true,
    virt_text_pos = 'eol', -- 'eol' | 'overlay' | 'right_align'
    delay = 350,
    ignore_whitespace = false,
    virt_text_priority = 100,
  },
  current_line_blame_formatter = '<author>, <author_time:%Y-%m-%d> - <summary>',
  sign_priority = 6,
  update_debounce = 100,
  status_formatter = nil, -- Use default
  max_file_length = 40000, -- Disable if file is longer than this (in lines)
  preview_config = {
    -- Options passed to nvim_open_win
    border = 'single',
    style = 'minimal',
    relative = 'cursor',
    row = 0,
    col = 1
  },
})
