export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '')
  
  // Add country code if missing
  if (digits.length === 10) {
    return `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  } else if (digits.startsWith('+')) {
    return phoneNumber
  }
  
  return phoneNumber
}

export function validatePhoneNumber(phoneNumber: string): boolean {
  const digits = phoneNumber.replace(/\D/g, '')
  
  // Valid formats:
  // 10 digits (US without country code)
  // 11 digits starting with 1 (US with country code)
  // Already has + prefix
  return (
    digits.length === 10 ||
    (digits.length === 11 && digits.startsWith('1')) ||
    phoneNumber.startsWith('+')
  )
}