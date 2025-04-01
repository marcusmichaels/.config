-- LSP configs: https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md
local lspconf = require 'lspconfig'

-- eslint: npm i -g vscode-langservers-extracted
lspconf.eslint.setup{
  on_attach = function(client, bufnr)
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      command = "EslintFixAll",
    })
  end,
}

-- tsserver: npm install -g typescript-language-server typescript
lspconf.ts_ls.setup{}
