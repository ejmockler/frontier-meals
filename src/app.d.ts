import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			supabase: SupabaseClient<any, 'public', any>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
		// interface PageState {}
		interface Platform {
			env: {
				SUPABASE_SERVICE_ROLE_KEY: string;
				STRIPE_SECRET_KEY: string;
				STRIPE_WEBHOOK_SECRET: string;
				STRIPE_PRICE_ID: string;
				TELEGRAM_BOT_TOKEN: string;
				TELEGRAM_SECRET_TOKEN: string;
				RESEND_API_KEY: string;
				RESEND_WEBHOOK_SECRET: string;
				SESSION_SECRET: string;
				CSRF_SECRET: string;
				CRON_SECRET: string;
				QR_PRIVATE_KEY_BASE64: string;
				QR_PUBLIC_KEY: string;
				KIOSK_PRIVATE_KEY_BASE64: string;
				KIOSK_PUBLIC_KEY: string;
				SITE_URL: string;
				DEMO_MODE?: string;
			};
		}
	}
}

export {};
