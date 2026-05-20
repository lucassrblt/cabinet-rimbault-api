interface EvaluationConfirmationProps {
  firstName: string
  lastName: string
  propertyType: string
  postalCode: string
  surface?: number
  rooms?: number
  agencyName: string
  agencyPhone?: string
  agencyEmail?: string
}

export function evaluationConfirmationEmail(props: EvaluationConfirmationProps): {
  subject: string
  html: string
} {
  const {
    firstName,
    lastName,
    propertyType,
    postalCode,
    surface,
    rooms,
    agencyName,
    agencyPhone,
    agencyEmail,
  } = props

  const emailSubject = "Votre demande d'estimation a bien été reçue"

  const propertyDetails: string[] = [
    `<p style="margin:0 0 4px;font-size:15px;line-height:1.5"><strong>Type de bien :</strong> ${propertyType}</p>`,
    `<p style="margin:0 0 4px;font-size:15px;line-height:1.5"><strong>Code postal :</strong> ${postalCode}</p>`,
  ]
  if (surface != null) {
    propertyDetails.push(`<p style="margin:0 0 4px;font-size:15px;line-height:1.5"><strong>Surface :</strong> ${surface} m²</p>`)
  }
  if (rooms != null) {
    propertyDetails.push(`<p style="margin:0 0 4px;font-size:15px;line-height:1.5"><strong>Pièces :</strong> ${rooms}</p>`)
  }

  const agencyContactLines: string[] = []
  if (agencyPhone) {
    agencyContactLines.push(`<li>Téléphone : <a href="tel:${agencyPhone}" style="color:#1a56db">${agencyPhone}</a></li>`)
  }
  if (agencyEmail) {
    agencyContactLines.push(`<li>Email : <a href="mailto:${agencyEmail}" style="color:#1a56db">${agencyEmail}</a></li>`)
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${emailSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${agencyName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Bonjour ${firstName} ${lastName},</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Nous avons bien reçu votre demande d'estimation et nous vous en remercions.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:6px;margin:0 0 24px">
                <tr>
                  <td style="padding:20px">
                    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Votre bien</p>
                    ${propertyDetails.join('\n                    ')}
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.5">Un professionnel vous contactera dans les plus brefs délais pour organiser une visite d'estimation.</p>

              ${agencyContactLines.length > 0 ? `
              <p style="margin:0 0 8px;font-size:15px;font-weight:700">Nos coordonnées :</p>
              <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8">
                ${agencyContactLines.join('\n                ')}
              </ul>` : ''}

              <p style="margin:0;font-size:16px;line-height:1.5">Cordialement,<br /><strong>${agencyName}</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center">
                Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject: emailSubject, html }
}
