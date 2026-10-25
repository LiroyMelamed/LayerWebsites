export type ProductId = 'barberbooking' | 'flygift' | 'layerwebsites' | 'lawyerapp' | 'melamotion' | 'contractor-monitor' | 'mela-media' | 'melamatch' | 'ironman' | 'central-platform';
export type ConsentProof = { optedIn: true; capturedAt: string; proofRef: string; scope: 'transactional' };
export type SystemMessage = {
  version: 1; eventId: string; productId: ProductId; occurredAt: string; expiresAt: string;
  recipient: string; recipientName: string; consent: ConsentProof;
  message:
    | { kind: 'payment_received'; amountCents: number; currency: 'ILS' | 'USD'; reference: string }
    | { kind: 'payment_due'; amountCents: number; currency: 'ILS' | 'USD'; reference: string; dueOn: string }
    | { kind: 'subscription_update'; status: 'active' | 'paused' | 'cancelled' | 'renewal_due'; planLabel: string; periodEndsOn: string }
    | { kind: 'system_notice'; notice: 'support_received' | 'support_updated' | 'service_restored'; reference: string }
    | { kind: 'system_notice'; notice: 'maintenance_scheduled'; reference: string; effectiveAt: string };
};
export type ConsentEvent = { version: 1; eventId: string; productId: ProductId; recipient: string; optedIn: boolean; capturedAt: string; proofRef: string; scope: 'transactional' };
export type PreparedEvent = Readonly<{ version: 1; path: string; eventId: string; body: string; bodySha256: string }>;
export type AttemptResult =
  | Readonly<{ state: 'accepted'; eventId: string; id?: string; status?: string; replayed: boolean; httpStatus: number; canRetrySameEvent: false }>
  | Readonly<{ state: 'acceptance_unknown' | 'rejected'; eventId: string; code: string; httpStatus?: number; canRetrySameEvent: boolean }>;
export declare const CENTRAL_ORIGIN: 'https://central-api.mela-media.co.il';
export declare const MESSAGE_PATH: '/api/v1/intake/system-messages';
export declare const CONSENT_PATH: '/api/v1/intake/system-messages/consent';
export declare const MESSAGE_ENDPOINT: 'https://central-api.mela-media.co.il/api/v1/intake/system-messages';
export declare function prepareMessage(input: SystemMessage): PreparedEvent;
export declare function prepareConsent(input: ConsentEvent): PreparedEvent;
export declare function restorePreparedEvent(input: unknown): PreparedEvent;
export declare function signRequest(input: { deployment: string; secret: string; timestamp: string; path?: string; body: string }): string;
export declare function createSystemMessagesClient(options: { deployment: string; secret: string; endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number }): Readonly<{ attempt(prepared: PreparedEvent): Promise<AttemptResult> }>;
