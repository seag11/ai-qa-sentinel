export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

/** The greeting at the top of the order confirmation email. */
export function confirmationGreeting(user: User): string {
  return `Thanks for your order, ${(user as any).fullName()}!`;
}
