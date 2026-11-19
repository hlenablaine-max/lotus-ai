// Roda uma vez quando o servidor do LOTUS sobe (ao abrir o aplicativo).
// O "if" precisa ter exatamente esta forma: é ele que impede o Next de tentar empacotar
// o código de servidor (fs, banco) para o runtime de borda.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
