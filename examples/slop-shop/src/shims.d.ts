// Type declarations for the payment helper, so the compiler can check calls to it.
declare module 'stripe-helpers-pro' {
  export function createCharge(options: {
    amount: number;
    token: string;
  }): Promise<{ id: string; paid: boolean }>;
}
