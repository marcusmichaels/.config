-- LSP configs: https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md

-- eslint: npm i -g vscode-langservers-extracted
vim.lsp.config.eslint = {
  on_attach = function(client, bufnr)
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      command = "EslintFixAll",
    })
  end,
}

vim.lsp.enable("eslint")

-- tsserver: npm i -g vscode-langservers-extracted
vim.lsp.config.ts_ls = {}

vim.lsp.enable("ts_ls")
