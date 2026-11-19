import * as os from 'os'
import * as path from 'path'

// Pasta de trabalho padrão dos agentes (arquivos gerados, scripts, backups, perfil do navegador)
export const WORKSPACE_DIR = path.join(os.homedir(), 'LOTUS_Workspace')
