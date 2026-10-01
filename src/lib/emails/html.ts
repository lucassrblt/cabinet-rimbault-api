/**
 * Échappe une valeur avant de l'interpoler dans un template d'e-mail HTML.
 * À appliquer à toute saisie utilisateur (et plus généralement à toute donnée
 * non constante) pour éviter l'injection de HTML dans les e-mails envoyés.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
