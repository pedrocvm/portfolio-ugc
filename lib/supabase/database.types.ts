export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_item: {
        Row: {
          brand_id: string | null
          collaboration_id: string | null
          created_at: string
          dedupe_key: string | null
          due_at: string | null
          evidence: Json
          id: string
          opportunity_id: string | null
          priority_score: number
          reason: string
          recommendation_id: string | null
          requires_approval: boolean
          risk: string
          snoozed_until: string | null
          source_event_id: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          collaboration_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          due_at?: string | null
          evidence?: Json
          id?: string
          opportunity_id?: string | null
          priority_score?: number
          reason?: string
          recommendation_id?: string | null
          requires_approval?: boolean
          risk?: string
          snoozed_until?: string | null
          source_event_id?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          collaboration_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          due_at?: string | null
          evidence?: Json
          id?: string
          opportunity_id?: string | null
          priority_score?: number
          reason?: string
          recommendation_id?: string | null
          requires_approval?: boolean
          risk?: string
          snoozed_until?: string | null
          source_event_id?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_item_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_item_collaboration_fk"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_item_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_item_recommendation_fk"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_item_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "activity_event"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_event: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          brand_id: string | null
          channel: string | null
          collaboration_id: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          id: string
          occurred_at: string
          opportunity_id: string | null
          payload: Json
          policy_version: string | null
          source_message_id: string | null
          source_thread_id: string | null
          summary: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          brand_id?: string | null
          channel?: string | null
          collaboration_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          payload?: Json
          policy_version?: string | null
          source_message_id?: string | null
          source_thread_id?: string | null
          summary?: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          brand_id?: string | null
          channel?: string | null
          collaboration_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          payload?: Json
          policy_version?: string | null
          source_message_id?: string | null
          source_thread_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_event_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_event_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_event_collaboration_fk"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_event_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_event_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recommendation: {
        Row: {
          action: string
          ai_run_id: string | null
          brand_id: string | null
          confidence: number | null
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          opportunity_id: string | null
          payload: Json
          reason: string
          requires_approval: boolean
          risk: string
          status: string
          summary: string
        }
        Insert: {
          action?: string
          ai_run_id?: string | null
          brand_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          opportunity_id?: string | null
          payload?: Json
          reason?: string
          requires_approval?: boolean
          risk?: string
          status?: string
          summary?: string
        }
        Update: {
          action?: string
          ai_run_id?: string | null
          brand_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          opportunity_id?: string | null
          payload?: Json
          reason?: string
          requires_approval?: boolean
          risk?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendation_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendation_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_run: {
        Row: {
          confidence: number | null
          created_at: string
          decided_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          error_summary: string | null
          evidence_refs: Json
          human_decision: string
          human_override: Json | null
          id: string
          input_hash: string | null
          latency_ms: number | null
          model_name: string
          model_provider: string
          model_tier: string | null
          policy_versions: Json
          prompt_version: string
          status: string
          structured_output: Json | null
          task_type: string
          usage_metadata: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_summary?: string | null
          evidence_refs?: Json
          human_decision?: string
          human_override?: Json | null
          id?: string
          input_hash?: string | null
          latency_ms?: number | null
          model_name?: string
          model_provider?: string
          model_tier?: string | null
          policy_versions?: Json
          prompt_version?: string
          status?: string
          structured_output?: Json | null
          task_type: string
          usage_metadata?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_summary?: string | null
          evidence_refs?: Json
          human_decision?: string
          human_override?: Json | null
          id?: string
          input_hash?: string | null
          latency_ms?: number | null
          model_name?: string
          model_provider?: string
          model_tier?: string | null
          policy_versions?: Json
          prompt_version?: string
          status?: string
          structured_output?: Json | null
          task_type?: string
          usage_metadata?: Json | null
        }
        Relationships: []
      }
      app_setting: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      app_user: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          role: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      assistant_attachment: {
        Row: {
          byte_size: number
          created_at: string
          file_name: string
          id: string
          kind: string
          knowledge_source_id: string | null
          media_type: string
          message_id: string | null
          mode: string
          storage_path: string
          thread_id: string
        }
        Insert: {
          byte_size?: number
          created_at?: string
          file_name?: string
          id?: string
          kind: string
          knowledge_source_id?: string | null
          media_type: string
          message_id?: string | null
          mode?: string
          storage_path: string
          thread_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          knowledge_source_id?: string | null
          media_type?: string
          message_id?: string | null
          mode?: string
          storage_path?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_attachment_knowledge_source_id_fkey"
            columns: ["knowledge_source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_attachment_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_attachment_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_insight: {
        Row: {
          app_user_id: string
          brand_id: string | null
          created_at: string
          dedupe_key: string
          detail: string
          href: string | null
          id: string
          kind: string
          opportunity_id: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          app_user_id: string
          brand_id?: string | null
          created_at?: string
          dedupe_key: string
          detail?: string
          href?: string | null
          id?: string
          kind: string
          opportunity_id?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          brand_id?: string | null
          created_at?: string
          dedupe_key?: string
          detail?: string
          href?: string | null
          id?: string
          kind?: string
          opportunity_id?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_insight_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_insight_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_insight_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_message: {
        Row: {
          cached_tokens: number | null
          content: string
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          prompt_version: string | null
          role: string
          sources: Json
          status: string
          thread_id: string
        }
        Insert: {
          cached_tokens?: number | null
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          role: string
          sources?: Json
          status?: string
          thread_id: string
        }
        Update: {
          cached_tokens?: number | null
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          role?: string
          sources?: Json
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_message_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_run: {
        Row: {
          cached_tokens: number | null
          error: string | null
          finished_at: string | null
          gate: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          message_id: string | null
          model: string
          output_tokens: number | null
          prompt_version: string
          started_at: string
          status: string
          thread_id: string
          tool_rounds: number
        }
        Insert: {
          cached_tokens?: number | null
          error?: string | null
          finished_at?: string | null
          gate?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          message_id?: string | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string
          started_at?: string
          status?: string
          thread_id: string
          tool_rounds?: number
        }
        Update: {
          cached_tokens?: number | null
          error?: string | null
          finished_at?: string | null
          gate?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          message_id?: string | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string
          started_at?: string
          status?: string
          thread_id?: string
          tool_rounds?: number
        }
        Relationships: [
          {
            foreignKeyName: "assistant_run_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_run_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_thread: {
        Row: {
          app_user_id: string
          archived_at: string | null
          context_id: string | null
          context_type: string | null
          created_at: string
          id: string
          last_message_at: string | null
          summary: string
          summary_through_id: string | null
          summary_version: number
          title: string
          updated_at: string
        }
        Insert: {
          app_user_id: string
          archived_at?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          summary?: string
          summary_through_id?: string | null
          summary_version?: number
          title?: string
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          archived_at?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          summary?: string
          summary_through_id?: string | null
          summary_version?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_thread_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_tool_call: {
        Row: {
          arguments: Json
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          result_summary: string
          run_id: string
          status: string
          tool: string
        }
        Insert: {
          arguments?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          result_summary?: string
          run_id: string
          status?: string
          tool: string
        }
        Update: {
          arguments?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          result_summary?: string
          run_id?: string
          status?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tool_call_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "assistant_run"
            referencedColumns: ["id"]
          },
        ]
      }
      brand: {
        Row: {
          approached_on: string | null
          category_primary: string | null
          category_tags: string[]
          channel: string
          contact: string
          country_code: string | null
          created_at: string
          domain: string | null
          dossier: Json | null
          dossier_at: string | null
          fit_band: string | null
          fit_breakdown: Json | null
          fit_override: Json | null
          fit_policy_version: string | null
          fit_score: number | null
          id: string
          instagram: string
          interest_level: number | null
          last_activity_at: string | null
          name: string
          next_step: string
          normalized_name: string | null
          notes: string
          source: string | null
          stage: string
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          approached_on?: string | null
          category_primary?: string | null
          category_tags?: string[]
          channel?: string
          contact?: string
          country_code?: string | null
          created_at?: string
          domain?: string | null
          dossier?: Json | null
          dossier_at?: string | null
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_override?: Json | null
          fit_policy_version?: string | null
          fit_score?: number | null
          id?: string
          instagram?: string
          interest_level?: number | null
          last_activity_at?: string | null
          name: string
          next_step?: string
          normalized_name?: string | null
          notes?: string
          source?: string | null
          stage?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          approached_on?: string | null
          category_primary?: string | null
          category_tags?: string[]
          channel?: string
          contact?: string
          country_code?: string | null
          created_at?: string
          domain?: string | null
          dossier?: Json | null
          dossier_at?: string | null
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_override?: Json | null
          fit_policy_version?: string | null
          fit_score?: number | null
          id?: string
          instagram?: string
          interest_level?: number | null
          last_activity_at?: string | null
          name?: string
          next_step?: string
          normalized_name?: string | null
          notes?: string
          source?: string | null
          stage?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      brand_identity: {
        Row: {
          brand_id: string
          created_at: string
          external_id: string
          id: string
          is_primary: boolean
          provider: string
          url: string | null
          verified: boolean
        }
        Insert: {
          brand_id: string
          created_at?: string
          external_id: string
          id?: string
          is_primary?: boolean
          provider: string
          url?: string | null
          verified?: boolean
        }
        Update: {
          brand_id?: string
          created_at?: string
          external_id?: string
          id?: string
          is_primary?: boolean
          provider?: string
          url?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "brand_identity_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_research_snapshot: {
        Row: {
          ai_run_id: string | null
          brand_id: string
          created_at: string
          dossier: Json
          evidence: Json
          fit_breakdown: Json | null
          fit_score: number | null
          id: string
          policy_version: string
        }
        Insert: {
          ai_run_id?: string | null
          brand_id: string
          created_at?: string
          dossier?: Json
          evidence?: Json
          fit_breakdown?: Json | null
          fit_score?: number | null
          id?: string
          policy_version?: string
        }
        Update: {
          ai_run_id?: string | null
          brand_id?: string
          created_at?: string
          dossier?: Json
          evidence?: Json
          fit_breakdown?: Json | null
          fit_score?: number | null
          id?: string
          policy_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_research_snapshot_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_research_snapshot_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      brief: {
        Row: {
          ai_run_id: string | null
          collaboration_id: string
          created_at: string
          gaps: string[]
          id: string
          opportunity_id: string | null
          parsed: Json
          questions: string[]
          raw_text: string
          risk_flags: Json
          source_kind: string
          source_ref: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          ai_run_id?: string | null
          collaboration_id: string
          created_at?: string
          gaps?: string[]
          id?: string
          opportunity_id?: string | null
          parsed?: Json
          questions?: string[]
          raw_text?: string
          risk_flags?: Json
          source_kind?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          ai_run_id?: string | null
          collaboration_id?: string
          created_at?: string
          gaps?: string[]
          id?: string
          opportunity_id?: string | null
          parsed?: Json
          questions?: string[]
          raw_text?: string
          risk_flags?: Json
          source_kind?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brief_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      business_memory: {
        Row: {
          app_user_id: string
          confidence: number | null
          content: string
          created_at: string
          effective_from: string
          id: string
          normalized_value: Json | null
          source: string
          source_message_id: string | null
          status: string
          subject: string
          superseded_by: string | null
          type: string
          updated_at: string
        }
        Insert: {
          app_user_id: string
          confidence?: number | null
          content: string
          created_at?: string
          effective_from?: string
          id?: string
          normalized_value?: Json | null
          source?: string
          source_message_id?: string | null
          status?: string
          subject?: string
          superseded_by?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          confidence?: number | null
          content?: string
          created_at?: string
          effective_from?: string
          id?: string
          normalized_value?: Json | null
          source?: string
          source_message_id?: string | null
          status?: string
          subject?: string
          superseded_by?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memory_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memory_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "assistant_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memory_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "business_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      business_milestone: {
        Row: {
          brand_id: string | null
          created_at: string
          dedupe_key: string
          evidence: Json
          id: string
          kind: string
          occurred_at: string
          summary: string
          used_for_content: boolean
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          dedupe_key: string
          evidence?: Json
          id?: string
          kind: string
          occurred_at: string
          summary: string
          used_for_content?: boolean
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          dedupe_key?: string
          evidence?: Json
          id?: string
          kind?: string
          occurred_at?: string
          summary?: string
          used_for_content?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "business_milestone_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_reference: {
        Row: {
          adaptation: string
          created_at: string
          creative_reference_id: string
          do_not_copy: string
          fit_reason: string
          id: string
          outreach_candidate_id: string
          rank: number
        }
        Insert: {
          adaptation?: string
          created_at?: string
          creative_reference_id: string
          do_not_copy?: string
          fit_reason?: string
          id?: string
          outreach_candidate_id: string
          rank?: number
        }
        Update: {
          adaptation?: string
          created_at?: string
          creative_reference_id?: string
          do_not_copy?: string
          fit_reason?: string
          id?: string
          outreach_candidate_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "candidate_reference_creative_reference_id_fkey"
            columns: ["creative_reference_id"]
            isOneToOne: false
            referencedRelation: "creative_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_reference_outreach_candidate_id_fkey"
            columns: ["outreach_candidate_id"]
            isOneToOne: false
            referencedRelation: "outreach_candidate"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_item: {
        Row: {
          brand_id: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string
          error_summary: string | null
          extracted: Json | null
          id: string
          kind: string
          note: string
          opportunity_id: string | null
          raw_input: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          error_summary?: string | null
          extracted?: Json | null
          id?: string
          kind: string
          note?: string
          opportunity_id?: string | null
          raw_input?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          error_summary?: string | null
          extracted?: Json | null
          id?: string
          kind?: string
          note?: string
          opportunity_id?: string | null
          raw_input?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_item_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_item_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_item_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      case_study: {
        Row: {
          brand_id: string
          capability_tags: string[]
          challenge: string
          collaboration_id: string | null
          created_at: string
          execution: string
          hypothesis: string
          id: string
          media_item_ids: string[]
          missing_metrics: string[]
          permission: string
          published_at: string | null
          result: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          brand_id: string
          capability_tags?: string[]
          challenge?: string
          collaboration_id?: string | null
          created_at?: string
          execution?: string
          hypothesis?: string
          id?: string
          media_item_ids?: string[]
          missing_metrics?: string[]
          permission?: string
          published_at?: string | null
          result?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          brand_id?: string
          capability_tags?: string[]
          challenge?: string
          collaboration_id?: string | null
          created_at?: string
          execution?: string
          hypothesis?: string
          id?: string
          media_item_ids?: string[]
          missing_metrics?: string[]
          permission?: string
          published_at?: string | null
          result?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_study_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_study_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration: {
        Row: {
          accepted_at: string | null
          access_note: string
          access_status: string | null
          brand_id: string
          closed_at: string | null
          compensation_model: string
          created_at: string
          deadline_at: string | null
          gate_blockers: string[]
          id: string
          logistics_kind: string | null
          notes: string
          opportunity_id: string
          payment_gate: string
          product_id: string | null
          received_at: string | null
          revisions_included: number | null
          shipped_at: string | null
          status: string
          title: string
          tracking_ref: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_note?: string
          access_status?: string | null
          brand_id: string
          closed_at?: string | null
          compensation_model?: string
          created_at?: string
          deadline_at?: string | null
          gate_blockers?: string[]
          id?: string
          logistics_kind?: string | null
          notes?: string
          opportunity_id: string
          payment_gate?: string
          product_id?: string | null
          received_at?: string | null
          revisions_included?: number | null
          shipped_at?: string | null
          status?: string
          title?: string
          tracking_ref?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_note?: string
          access_status?: string | null
          brand_id?: string
          closed_at?: string | null
          compensation_model?: string
          created_at?: string
          deadline_at?: string | null
          gate_blockers?: string[]
          id?: string
          logistics_kind?: string | null
          notes?: string
          opportunity_id?: string
          payment_gate?: string
          product_id?: string | null
          received_at?: string | null
          revisions_included?: number | null
          shipped_at?: string | null
          status?: string
          title?: string
          tracking_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          brand_id: string
          created_at: string
          email: string | null
          id: string
          language: string | null
          name: string
          notes: string
          phone: string | null
          preferred_channel: string | null
          relationship_strength: number | null
          role: string
          social_handle: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          email?: string | null
          id?: string
          language?: string | null
          name?: string
          notes?: string
          phone?: string | null
          preferred_channel?: string | null
          relationship_strength?: number | null
          role?: string
          social_handle?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          email?: string | null
          id?: string
          language?: string | null
          name?: string
          notes?: string
          phone?: string | null
          preferred_channel?: string | null
          relationship_strength?: number | null
          role?: string
          social_handle?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      content_asset: {
        Row: {
          brand_id: string | null
          capabilities: string[]
          collaboration_id: string | null
          core_message: string
          created_at: string
          cta: string
          emotion: string
          format: string
          funnel_role: string | null
          hook: string
          hypothesis: string
          id: string
          language: string
          media_item_id: string | null
          portfolio_permission: boolean | null
          product_id: string | null
          published_at: string | null
          script: string
          shot_list: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          capabilities?: string[]
          collaboration_id?: string | null
          core_message?: string
          created_at?: string
          cta?: string
          emotion?: string
          format?: string
          funnel_role?: string | null
          hook?: string
          hypothesis?: string
          id?: string
          language?: string
          media_item_id?: string | null
          portfolio_permission?: boolean | null
          product_id?: string | null
          published_at?: string | null
          script?: string
          shot_list?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          capabilities?: string[]
          collaboration_id?: string | null
          core_message?: string
          created_at?: string
          cta?: string
          emotion?: string
          format?: string
          funnel_role?: string | null
          hook?: string
          hypothesis?: string
          id?: string
          language?: string
          media_item_id?: string | null
          portfolio_permission?: boolean | null
          product_id?: string | null
          published_at?: string | null
          script?: string
          shot_list?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_asset_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_asset_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_asset_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_asset_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance: {
        Row: {
          comments: number | null
          created_at: string
          follows: number | null
          id: string
          idea_id: string | null
          inbound_leads: number | null
          likes: number | null
          measured_at: string
          platform: string
          post_url: string | null
          profile_visits: number | null
          saves: number | null
          shares: number | null
          source: string
          views: number | null
          watch_time_seconds: number | null
        }
        Insert: {
          comments?: number | null
          created_at?: string
          follows?: number | null
          id?: string
          idea_id?: string | null
          inbound_leads?: number | null
          likes?: number | null
          measured_at?: string
          platform: string
          post_url?: string | null
          profile_visits?: number | null
          saves?: number | null
          shares?: number | null
          source?: string
          views?: number | null
          watch_time_seconds?: number | null
        }
        Update: {
          comments?: number | null
          created_at?: string
          follows?: number | null
          id?: string
          idea_id?: string | null
          inbound_leads?: number | null
          likes?: number | null
          measured_at?: string
          platform?: string
          post_url?: string | null
          profile_visits?: number | null
          saves?: number | null
          shares?: number | null
          source?: string
          views?: number | null
          watch_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "creator_content_idea"
            referencedColumns: ["id"]
          },
        ]
      }
      content_series: {
        Row: {
          created_at: string
          episodes: number
          id: string
          last_episode_at: string | null
          name: string
          next_topics: Json
          premise: string
          status: string
          structure: string
        }
        Insert: {
          created_at?: string
          episodes?: number
          id?: string
          last_episode_at?: string | null
          name: string
          next_topics?: Json
          premise?: string
          status?: string
          structure?: string
        }
        Update: {
          created_at?: string
          episodes?: number
          id?: string
          last_episode_at?: string | null
          name?: string
          next_topics?: Json
          premise?: string
          status?: string
          structure?: string
        }
        Relationships: []
      }
      creative_hypothesis: {
        Row: {
          ai_run_id: string | null
          brand_id: string
          capabilities: string[]
          core_message: string
          created_at: string
          cta: string
          demonstration: string
          emotion: string
          friction: string
          funnel_role: string | null
          hook: string
          id: string
          opportunity_id: string | null
          product_id: string | null
          status: string
          title: string
        }
        Insert: {
          ai_run_id?: string | null
          brand_id: string
          capabilities?: string[]
          core_message?: string
          created_at?: string
          cta?: string
          demonstration?: string
          emotion?: string
          friction?: string
          funnel_role?: string | null
          hook?: string
          id?: string
          opportunity_id?: string | null
          product_id?: string | null
          status?: string
          title: string
        }
        Update: {
          ai_run_id?: string | null
          brand_id?: string
          capabilities?: string[]
          core_message?: string
          created_at?: string
          cta?: string
          demonstration?: string
          emotion?: string
          friction?: string
          funnel_role?: string | null
          hook?: string
          id?: string
          opportunity_id?: string | null
          product_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_hypothesis_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_hypothesis_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_hypothesis_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_hypothesis_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_reference: {
        Row: {
          ai_run_id: string | null
          brand_name: string | null
          captured_at: string
          content_type: string | null
          created_at: string
          creator_handle: string | null
          duration_seconds: number | null
          editing_style: string
          format: string
          freshness: string
          hook: string
          id: string
          metrics: Json
          published_at: string | null
          purpose: string
          signals: Json
          source_confidence: string
          source_platform: string
          source_url: string
          structure: string
          title: string
          url_hash: string
          why_it_works: string
        }
        Insert: {
          ai_run_id?: string | null
          brand_name?: string | null
          captured_at?: string
          content_type?: string | null
          created_at?: string
          creator_handle?: string | null
          duration_seconds?: number | null
          editing_style?: string
          format?: string
          freshness?: string
          hook?: string
          id?: string
          metrics?: Json
          published_at?: string | null
          purpose?: string
          signals?: Json
          source_confidence?: string
          source_platform: string
          source_url: string
          structure?: string
          title?: string
          url_hash: string
          why_it_works?: string
        }
        Update: {
          ai_run_id?: string | null
          brand_name?: string | null
          captured_at?: string
          content_type?: string | null
          created_at?: string
          creator_handle?: string | null
          duration_seconds?: number | null
          editing_style?: string
          format?: string
          freshness?: string
          hook?: string
          id?: string
          metrics?: Json
          published_at?: string | null
          purpose?: string
          signals?: Json
          source_confidence?: string
          source_platform?: string
          source_url?: string
          structure?: string
          title?: string
          url_hash?: string
          why_it_works?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_reference_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_content_idea: {
        Row: {
          ai_run_id: string | null
          alt_hooks: Json
          app_user_id: string
          authority_signal: string
          b_roll: Json
          brand_audience_effect: string
          caption: string
          collaboration_id: string | null
          cover_note: string
          created_at: string
          cta: string
          decided_at: string | null
          duration_seconds: number | null
          editing_plan: Json
          energy: string | null
          engagement_mechanism: string
          episode: number | null
          estimated_edit_minutes: number | null
          estimated_record_minutes: number | null
          fingerprint: string
          format: string
          fresh_until: string | null
          generated_at: string
          hook: string
          id: string
          mentorship_signal: boolean
          milestone_id: string | null
          objective: string
          on_screen_text: Json
          pillar: string
          plan_date: string
          platform: string
          posting_notes: string
          provenance: string | null
          quality: Json
          reference_ids: string[]
          script: string
          series_id: string | null
          shot_list: Json
          source_reason: string
          status: string
          strategy_version: string | null
          title: string
          trend_ids: string[]
          why_it_can_work: string
        }
        Insert: {
          ai_run_id?: string | null
          alt_hooks?: Json
          app_user_id: string
          authority_signal?: string
          b_roll?: Json
          brand_audience_effect?: string
          caption?: string
          collaboration_id?: string | null
          cover_note?: string
          created_at?: string
          cta?: string
          decided_at?: string | null
          duration_seconds?: number | null
          editing_plan?: Json
          energy?: string | null
          engagement_mechanism?: string
          episode?: number | null
          estimated_edit_minutes?: number | null
          estimated_record_minutes?: number | null
          fingerprint: string
          format?: string
          fresh_until?: string | null
          generated_at?: string
          hook?: string
          id?: string
          mentorship_signal?: boolean
          milestone_id?: string | null
          objective?: string
          on_screen_text?: Json
          pillar?: string
          plan_date: string
          platform: string
          posting_notes?: string
          provenance?: string | null
          quality?: Json
          reference_ids?: string[]
          script?: string
          series_id?: string | null
          shot_list?: Json
          source_reason?: string
          status?: string
          strategy_version?: string | null
          title?: string
          trend_ids?: string[]
          why_it_can_work?: string
        }
        Update: {
          ai_run_id?: string | null
          alt_hooks?: Json
          app_user_id?: string
          authority_signal?: string
          b_roll?: Json
          brand_audience_effect?: string
          caption?: string
          collaboration_id?: string | null
          cover_note?: string
          created_at?: string
          cta?: string
          decided_at?: string | null
          duration_seconds?: number | null
          editing_plan?: Json
          energy?: string | null
          engagement_mechanism?: string
          episode?: number | null
          estimated_edit_minutes?: number | null
          estimated_record_minutes?: number | null
          fingerprint?: string
          format?: string
          fresh_until?: string | null
          generated_at?: string
          hook?: string
          id?: string
          mentorship_signal?: boolean
          milestone_id?: string | null
          objective?: string
          on_screen_text?: Json
          pillar?: string
          plan_date?: string
          platform?: string
          posting_notes?: string
          provenance?: string | null
          quality?: Json
          reference_ids?: string[]
          script?: string
          series_id?: string | null
          shot_list?: Json
          source_reason?: string
          status?: string
          strategy_version?: string | null
          title?: string
          trend_ids?: string[]
          why_it_can_work?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_content_idea_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_idea_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_idea_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_idea_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "business_milestone"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_idea_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "content_series"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profile: {
        Row: {
          ai_run_id: string | null
          app_user_id: string
          avoided_formats: Json
          coverage: string
          created_at: string
          dimensions: Json
          evidence: Json
          handle: string
          id: string
          sample_size: number
          source: string | null
          strategy_version: string | null
          successful_formats: Json
          topics: Json
          updated_at: string
        }
        Insert: {
          ai_run_id?: string | null
          app_user_id: string
          avoided_formats?: Json
          coverage?: string
          created_at?: string
          dimensions?: Json
          evidence?: Json
          handle?: string
          id?: string
          sample_size?: number
          source?: string | null
          strategy_version?: string | null
          successful_formats?: Json
          topics?: Json
          updated_at?: string
        }
        Update: {
          ai_run_id?: string | null
          app_user_id?: string
          avoided_formats?: Json
          coverage?: string
          created_at?: string
          dimensions?: Json
          evidence?: Json
          handle?: string
          id?: string
          sample_size?: number
          source?: string | null
          strategy_version?: string | null
          successful_formats?: Json
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_profile_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_profile_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: true
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_trend: {
        Row: {
          adaptation: string
          created_at: string
          description: string
          detected_at: string
          evidence: Json
          fingerprint: string
          fit_reason: string
          fit_score: number | null
          fit_verdict: string
          freshness: string
          id: string
          kind: string
          platform: string
          published_at: string | null
          run_id: string | null
          source_url: string | null
          title: string
          why_trending: string
        }
        Insert: {
          adaptation?: string
          created_at?: string
          description?: string
          detected_at?: string
          evidence?: Json
          fingerprint: string
          fit_reason?: string
          fit_score?: number | null
          fit_verdict?: string
          freshness?: string
          id?: string
          kind?: string
          platform?: string
          published_at?: string | null
          run_id?: string | null
          source_url?: string | null
          title: string
          why_trending?: string
        }
        Update: {
          adaptation?: string
          created_at?: string
          description?: string
          detected_at?: string
          evidence?: Json
          fingerprint?: string
          fit_reason?: string
          fit_score?: number | null
          fit_verdict?: string
          freshness?: string
          id?: string
          kind?: string
          platform?: string
          published_at?: string | null
          run_id?: string | null
          source_url?: string | null
          title?: string
          why_trending?: string
        }
        Relationships: []
      }
      cron_dispatch: {
        Row: {
          confirmed_at: string | null
          dispatched_at: string
          error: string | null
          id: string
          job_type: string
          processed_count: number | null
          request_id: number | null
          status: string
          status_code: number | null
        }
        Insert: {
          confirmed_at?: string | null
          dispatched_at?: string
          error?: string | null
          id?: string
          job_type: string
          processed_count?: number | null
          request_id?: number | null
          status?: string
          status_code?: number | null
        }
        Update: {
          confirmed_at?: string | null
          dispatched_at?: string
          error?: string | null
          id?: string
          job_type?: string
          processed_count?: number | null
          request_id?: number | null
          status?: string
          status_code?: number | null
        }
        Relationships: []
      }
      deliverable: {
        Row: {
          approval_status: string
          approved_at: string | null
          asset_url: string
          channel: string
          collaboration_id: string
          content_asset_id: string | null
          created_at: string
          delivered_at: string | null
          feedback: string
          feedback_class: string | null
          id: string
          recipient: string
          storage_path: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          asset_url?: string
          channel?: string
          collaboration_id: string
          content_asset_id?: string | null
          created_at?: string
          delivered_at?: string | null
          feedback?: string
          feedback_class?: string | null
          id?: string
          recipient?: string
          storage_path?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          asset_url?: string
          channel?: string
          collaboration_id?: string
          content_asset_id?: string | null
          created_at?: string
          delivered_at?: string | null
          feedback?: string
          feedback_class?: string | null
          id?: string
          recipient?: string
          storage_path?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverable_content_asset_id_fkey"
            columns: ["content_asset_id"]
            isOneToOne: false
            referencedRelation: "content_asset"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          accepted_at: string | null
          brand_id: string | null
          collaboration_id: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          link_confidence: number | null
          link_source: string | null
          opportunity_id: string | null
          quote_id: string | null
          sent_at: string | null
          status: string
          supersedes_document_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          brand_id?: string | null
          collaboration_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind: string
          link_confidence?: number | null
          link_source?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          supersedes_document_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          brand_id?: string | null
          collaboration_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          link_confidence?: number | null
          link_source?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          supersedes_document_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_supersedes_document_id_fkey"
            columns: ["supersedes_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up: {
        Row: {
          brand_id: string | null
          cancelled_reason: string | null
          created_at: string
          draft_text: string | null
          due_at: string
          id: string
          opportunity_id: string
          policy_version: string
          reason: string
          sent_at: string | null
          sent_message_id: string | null
          sequence_index: number
          situation: string
          status: string
          trigger_event_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          cancelled_reason?: string | null
          created_at?: string
          draft_text?: string | null
          due_at: string
          id?: string
          opportunity_id: string
          policy_version: string
          reason?: string
          sent_at?: string | null
          sent_message_id?: string | null
          sequence_index?: number
          situation: string
          status?: string
          trigger_event_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          cancelled_reason?: string | null
          created_at?: string
          draft_text?: string | null
          due_at?: string
          id?: string
          opportunity_id?: string
          policy_version?: string
          reason?: string
          sent_at?: string | null
          sent_message_id?: string | null
          sequence_index?: number
          situation?: string
          status?: string
          trigger_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "activity_event"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connection: {
        Row: {
          account_identifier: string
          app_user_id: string
          created_at: string
          cursor: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          id: string
          last_error_at: string | null
          last_error_code: string | null
          last_success_at: string | null
          last_sync_at: string | null
          provider: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          account_identifier?: string
          app_user_id: string
          created_at?: string
          cursor?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          provider: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          account_identifier?: string
          app_user_id?: string
          created_at?: string
          cursor?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          provider?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connection_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      job_run: {
        Row: {
          attempt: number
          cursor_after: string | null
          cursor_before: string | null
          detail: Json
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          items_processed: number
          job_type: string
          started_at: string
          status: string
        }
        Insert: {
          attempt?: number
          cursor_after?: string | null
          cursor_before?: string | null
          detail?: Json
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          items_processed?: number
          job_type: string
          started_at?: string
          status?: string
        }
        Update: {
          attempt?: number
          cursor_after?: string | null
          cursor_before?: string | null
          detail?: Json
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          items_processed?: number
          job_type?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      knowledge_chunk: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          heading: string
          id: string
          ordinal: number
          search: unknown
          source_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          heading?: string
          id?: string
          ordinal?: number
          search?: unknown
          source_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          heading?: string
          id?: string
          ordinal?: number
          search?: unknown
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunk_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_source: {
        Row: {
          authority: number
          checksum: string | null
          created_at: string
          effective_date: string | null
          id: string
          source_type: string
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          authority?: number
          checksum?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          source_type: string
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          version?: string
        }
        Update: {
          authority?: number
          checksum?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      link_event: {
        Row: {
          country: string
          created_at: string
          device: string
          id: string
          referrer: string
          session: string
          target: string
          type: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }
        Insert: {
          country?: string
          created_at?: string
          device?: string
          id?: string
          referrer?: string
          session?: string
          target?: string
          type: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
        }
        Update: {
          country?: string
          created_at?: string
          device?: string
          id?: string
          referrer?: string
          session?: string
          target?: string
          type?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
        }
        Relationships: []
      }
      media_item: {
        Row: {
          created_at: string
          id: string
          kind: string
          niche: string
          storage_path: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          niche?: string
          storage_path?: string
          title?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          niche?: string
          storage_path?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      morning_brief: {
        Row: {
          app_user_id: string
          brief_date: string
          completed_at: string | null
          created_at: string
          decision_count: number
          decisions: Json
          estimated_minutes: number | null
          gaps: Json
          headline: string
          id: string
          opened_at: string | null
          prepared: Json
          status: string
          updated_at: string
        }
        Insert: {
          app_user_id: string
          brief_date: string
          completed_at?: string | null
          created_at?: string
          decision_count?: number
          decisions?: Json
          estimated_minutes?: number | null
          gaps?: Json
          headline?: string
          id?: string
          opened_at?: string | null
          prepared?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          brief_date?: string
          completed_at?: string | null
          created_at?: string
          decision_count?: number
          decisions?: Json
          estimated_minutes?: number | null
          gaps?: Json
          headline?: string
          id?: string
          opened_at?: string | null
          prepared?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "morning_brief_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity: {
        Row: {
          barter_value_to_carol_cents: number | null
          brand_id: string
          commercial_model: string
          created_at: string
          currency: string
          expected_cash_cents: number | null
          id: string
          last_activity_at: string | null
          legacy_brand_stage: string | null
          loss_reason: string | null
          lost_at: string | null
          next_action_due_at: string | null
          next_action_text: string
          primary_contact_id: string | null
          priority: string
          product_name: string
          source: string | null
          stage: string
          title: string
          updated_at: string
          waiting_reason: string | null
          waiting_until: string | null
          won_at: string | null
        }
        Insert: {
          barter_value_to_carol_cents?: number | null
          brand_id: string
          commercial_model?: string
          created_at?: string
          currency?: string
          expected_cash_cents?: number | null
          id?: string
          last_activity_at?: string | null
          legacy_brand_stage?: string | null
          loss_reason?: string | null
          lost_at?: string | null
          next_action_due_at?: string | null
          next_action_text?: string
          primary_contact_id?: string | null
          priority?: string
          product_name?: string
          source?: string | null
          stage?: string
          title?: string
          updated_at?: string
          waiting_reason?: string | null
          waiting_until?: string | null
          won_at?: string | null
        }
        Update: {
          barter_value_to_carol_cents?: number | null
          brand_id?: string
          commercial_model?: string
          created_at?: string
          currency?: string
          expected_cash_cents?: number | null
          id?: string
          last_activity_at?: string | null
          legacy_brand_stage?: string | null
          loss_reason?: string | null
          lost_at?: string | null
          next_action_due_at?: string | null
          next_action_text?: string
          primary_contact_id?: string | null
          priority?: string
          product_name?: string
          source?: string | null
          stage?: string
          title?: string
          updated_at?: string
          waiting_reason?: string | null
          waiting_until?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_candidate: {
        Row: {
          ai_body: string
          ai_subject: string
          body: string
          brand_id: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_role: string | null
          contact_source: string | null
          content_ideas: Json
          country: string | null
          created_at: string
          creative_angle: string | null
          creative_opportunity: string
          domain: string | null
          email_confidence: string | null
          field_sources: Json
          fit_band: string | null
          fit_breakdown: Json | null
          fit_score: number | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          instagram: string | null
          language: string
          linkedin: string | null
          name: string
          niche_id: string | null
          normalized_name: string
          opportunity_id: string | null
          paid_media_signal: string | null
          phone: string | null
          portfolio_match: Json | null
          product: string | null
          quality: Json | null
          rank: number
          ready_idea: Json | null
          red_flags: Json
          references_at: string | null
          references_note: string | null
          references_state: string
          reject_reason: string | null
          researched_at: string | null
          risk: string
          run_id: string
          saved: boolean
          saved_at: string | null
          search_relevance: number | null
          sent_at: string | null
          socials: Json
          sources: Json
          status: string
          subject: string
          ugc_opportunity: number | null
          ugc_signal: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
          why_fit: string
          why_may_pay: string
          why_now: string
        }
        Insert: {
          ai_body?: string
          ai_subject?: string
          body?: string
          brand_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          contact_source?: string | null
          content_ideas?: Json
          country?: string | null
          created_at?: string
          creative_angle?: string | null
          creative_opportunity?: string
          domain?: string | null
          email_confidence?: string | null
          field_sources?: Json
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_score?: number | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          instagram?: string | null
          language?: string
          linkedin?: string | null
          name: string
          niche_id?: string | null
          normalized_name: string
          opportunity_id?: string | null
          paid_media_signal?: string | null
          phone?: string | null
          portfolio_match?: Json | null
          product?: string | null
          quality?: Json | null
          rank?: number
          ready_idea?: Json | null
          red_flags?: Json
          references_at?: string | null
          references_note?: string | null
          references_state?: string
          reject_reason?: string | null
          researched_at?: string | null
          risk?: string
          run_id: string
          saved?: boolean
          saved_at?: string | null
          search_relevance?: number | null
          sent_at?: string | null
          socials?: Json
          sources?: Json
          status?: string
          subject?: string
          ugc_opportunity?: number | null
          ugc_signal?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          why_fit?: string
          why_may_pay?: string
          why_now?: string
        }
        Update: {
          ai_body?: string
          ai_subject?: string
          body?: string
          brand_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          contact_source?: string | null
          content_ideas?: Json
          country?: string | null
          created_at?: string
          creative_angle?: string | null
          creative_opportunity?: string
          domain?: string | null
          email_confidence?: string | null
          field_sources?: Json
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_score?: number | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          instagram?: string | null
          language?: string
          linkedin?: string | null
          name?: string
          niche_id?: string | null
          normalized_name?: string
          opportunity_id?: string | null
          paid_media_signal?: string | null
          phone?: string | null
          portfolio_match?: Json | null
          product?: string | null
          quality?: Json | null
          rank?: number
          ready_idea?: Json | null
          red_flags?: Json
          references_at?: string | null
          references_note?: string | null
          references_state?: string
          reject_reason?: string | null
          researched_at?: string | null
          risk?: string
          run_id?: string
          saved?: boolean
          saved_at?: string | null
          search_relevance?: number | null
          sent_at?: string | null
          socials?: Json
          sources?: Json
          status?: string
          subject?: string
          ugc_opportunity?: number | null
          ugc_signal?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          why_fit?: string
          why_may_pay?: string
          why_now?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_candidate_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_candidate_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_candidate_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "outreach_run"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_focus: {
        Row: {
          app_user_id: string
          countries: Json
          id: string
          niches: Json
          per_day: number
          updated_at: string
        }
        Insert: {
          app_user_id: string
          countries?: Json
          id?: string
          niches?: Json
          per_day?: number
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          countries?: Json
          id?: string
          niches?: Json
          per_day?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_focus_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: true
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_run: {
        Row: {
          app_user_id: string
          countries: Json
          discovered: number
          error: string | null
          finished_at: string | null
          id: string
          input_tokens: number
          intent: Json
          kind: string
          output_tokens: number
          partial_failures: Json
          raw_query: string | null
          rejected_country: number
          rejected_irrelevant: number
          rejected_known: number
          researched: number
          run_date: string
          screened: number
          search_terms: Json
          selected: number
          started_at: string
          status: string
          strategy: Json
        }
        Insert: {
          app_user_id: string
          countries?: Json
          discovered?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          intent?: Json
          kind?: string
          output_tokens?: number
          partial_failures?: Json
          raw_query?: string | null
          rejected_country?: number
          rejected_irrelevant?: number
          rejected_known?: number
          researched?: number
          run_date: string
          screened?: number
          search_terms?: Json
          selected?: number
          started_at?: string
          status?: string
          strategy?: Json
        }
        Update: {
          app_user_id?: string
          countries?: Json
          discovered?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          intent?: Json
          kind?: string
          output_tokens?: number
          partial_failures?: Json
          raw_query?: string | null
          rejected_country?: number
          rejected_irrelevant?: number
          rejected_known?: number
          researched?: number
          run_date?: string
          screened?: number
          search_terms?: Json
          selected?: number
          started_at?: string
          status?: string
          strategy?: Json
        }
        Relationships: [
          {
            foreignKeyName: "outreach_run_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_style_profile: {
        Row: {
          app_user_id: string
          built_at: string
          edit_patterns: Json
          id: string
          language: string
          profile: Json
          sample_count: number
          version: number
        }
        Insert: {
          app_user_id: string
          built_at?: string
          edit_patterns?: Json
          id?: string
          language?: string
          profile?: Json
          sample_count?: number
          version?: number
        }
        Update: {
          app_user_id?: string
          built_at?: string
          edit_patterns?: Json
          id?: string
          language?: string
          profile?: Json
          sample_count?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_style_profile_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_suppression: {
        Row: {
          app_user_id: string
          brand_id: string | null
          created_at: string
          domain: string | null
          id: string
          kind: string
          normalized_name: string
          reason: string
          until: string | null
        }
        Insert: {
          app_user_id: string
          brand_id?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          normalized_name: string
          reason?: string
          until?: string | null
        }
        Update: {
          app_user_id?: string
          brand_id?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          normalized_name?: string
          reason?: string
          until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_suppression_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_suppression_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          amount_cents: number
          brand_id: string
          collaboration_id: string | null
          created_at: string
          currency: string
          due_at: string | null
          id: string
          invoice_ref: string
          kind: string
          notes: string
          opportunity_id: string | null
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          brand_id: string
          collaboration_id?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_ref?: string
          kind?: string
          notes?: string
          opportunity_id?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          brand_id?: string
          collaboration_id?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_ref?: string
          kind?: string
          notes?: string
          opportunity_id?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_snapshot: {
        Row: {
          brand_id: string
          collaboration_id: string | null
          confidence: number | null
          content_asset_id: string | null
          id: string
          metrics: Json
          period_end: string | null
          period_start: string | null
          qualitative: string
          received_at: string
          source: string
        }
        Insert: {
          brand_id: string
          collaboration_id?: string | null
          confidence?: number | null
          content_asset_id?: string | null
          id?: string
          metrics?: Json
          period_end?: string | null
          period_start?: string | null
          qualitative?: string
          received_at?: string
          source?: string
        }
        Update: {
          brand_id?: string
          collaboration_id?: string | null
          confidence?: number | null
          content_asset_id?: string | null
          id?: string
          metrics?: Json
          period_end?: string | null
          period_start?: string | null
          qualitative?: string
          received_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_snapshot_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_snapshot_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_snapshot_content_asset_id_fkey"
            columns: ["content_asset_id"]
            isOneToOne: false
            referencedRelation: "content_asset"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_policy: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string | null
          effective_to: string | null
          id: string
          markets: string[]
          notes: string
          rules: Json
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          markets?: string[]
          notes?: string
          rules?: Json
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          markets?: string[]
          notes?: string
          rules?: Json
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_policy_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_policy_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          brand_id: string
          carol_interest: number | null
          carol_would_buy: boolean | null
          category: string | null
          created_at: string
          currency: string
          demo_potential: number | null
          id: string
          kind: string
          name: string
          notes: string
          owned_already: boolean
          retail_price_cents: number | null
          sku: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          brand_id: string
          carol_interest?: number | null
          carol_would_buy?: boolean | null
          category?: string | null
          created_at?: string
          currency?: string
          demo_potential?: number | null
          id?: string
          kind?: string
          name: string
          notes?: string
          owned_already?: boolean
          retail_price_cents?: number | null
          sku?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          brand_id?: string
          carol_interest?: number | null
          carol_would_buy?: boolean | null
          category?: string | null
          created_at?: string
          currency?: string
          demo_potential?: number | null
          id?: string
          kind?: string
          name?: string
          notes?: string
          owned_already?: boolean
          retail_price_cents?: number | null
          sku?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      quote: {
        Row: {
          adjustments_cents: number
          approved_at: string | null
          approved_by: string | null
          base_cents: number
          below_floor: boolean
          brand_id: string | null
          created_at: string
          currency: string
          document_id: string | null
          final_cents: number | null
          id: string
          input_scope: Json
          line_items: Json
          minimum_cents: number | null
          opportunity_id: string
          override_reason: string | null
          pricing_policy_version: string
          recommended_cents: number
          rights_snapshot: Json
          sent_at: string | null
          status: string
          superseded_by: string | null
          unresolved: string[]
          updated_at: string
          version: number
        }
        Insert: {
          adjustments_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          base_cents?: number
          below_floor?: boolean
          brand_id?: string | null
          created_at?: string
          currency?: string
          document_id?: string | null
          final_cents?: number | null
          id?: string
          input_scope?: Json
          line_items?: Json
          minimum_cents?: number | null
          opportunity_id: string
          override_reason?: string | null
          pricing_policy_version: string
          recommended_cents?: number
          rights_snapshot?: Json
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          unresolved?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          adjustments_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          base_cents?: number
          below_floor?: boolean
          brand_id?: string | null
          created_at?: string
          currency?: string
          document_id?: string | null
          final_cents?: number | null
          id?: string
          input_scope?: Json
          line_items?: Json
          minimum_cents?: number | null
          opportunity_id?: string
          override_reason?: string | null
          pricing_policy_version?: string
          recommended_cents?: number
          rights_snapshot?: Json
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          unresolved?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_document_fk"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "quote"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship: {
        Row: {
          brand_id: string
          collaborations_count: number
          first_contact_at: string | null
          last_interaction_at: string | null
          last_job_at: string | null
          lost_count: number
          next_touch_at: string | null
          opportunities_count: number
          responsiveness: number | null
          satisfaction: number | null
          total_barter_cents: number
          total_cash_cents: number
          updated_at: string
          upsell_ideas: Json
          won_count: number
        }
        Insert: {
          brand_id: string
          collaborations_count?: number
          first_contact_at?: string | null
          last_interaction_at?: string | null
          last_job_at?: string | null
          lost_count?: number
          next_touch_at?: string | null
          opportunities_count?: number
          responsiveness?: number | null
          satisfaction?: number | null
          total_barter_cents?: number
          total_cash_cents?: number
          updated_at?: string
          upsell_ideas?: Json
          won_count?: number
        }
        Update: {
          brand_id?: string
          collaborations_count?: number
          first_contact_at?: string | null
          last_interaction_at?: string | null
          last_job_at?: string | null
          lost_count?: number
          next_touch_at?: string | null
          opportunities_count?: number
          responsiveness?: number | null
          satisfaction?: number | null
          total_barter_cents?: number
          total_cash_cents?: number
          updated_at?: string
          upsell_ideas?: Json
          won_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "relationship_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
        ]
      }
      rights_license: {
        Row: {
          brand_id: string
          collaboration_id: string | null
          content_asset_id: string | null
          created_at: string
          currency: string
          document_id: string | null
          duration_days: number | null
          editing_permissions: string
          end_at: string | null
          exclusivity: boolean
          exclusivity_end_at: string | null
          exclusivity_scope: string | null
          fee_cents: number | null
          id: string
          notes: string
          opportunity_id: string | null
          organic_allowed: boolean
          paid_allowed: boolean
          platforms: string[]
          portfolio_permission: boolean | null
          quote_id: string | null
          raw_footage: boolean
          renewed_into_id: string | null
          start_at: string | null
          status: string
          territories: string[]
          third_party_usage: boolean
          updated_at: string
          whitelisting: boolean
        }
        Insert: {
          brand_id: string
          collaboration_id?: string | null
          content_asset_id?: string | null
          created_at?: string
          currency?: string
          document_id?: string | null
          duration_days?: number | null
          editing_permissions?: string
          end_at?: string | null
          exclusivity?: boolean
          exclusivity_end_at?: string | null
          exclusivity_scope?: string | null
          fee_cents?: number | null
          id?: string
          notes?: string
          opportunity_id?: string | null
          organic_allowed?: boolean
          paid_allowed?: boolean
          platforms?: string[]
          portfolio_permission?: boolean | null
          quote_id?: string | null
          raw_footage?: boolean
          renewed_into_id?: string | null
          start_at?: string | null
          status?: string
          territories?: string[]
          third_party_usage?: boolean
          updated_at?: string
          whitelisting?: boolean
        }
        Update: {
          brand_id?: string
          collaboration_id?: string | null
          content_asset_id?: string | null
          created_at?: string
          currency?: string
          document_id?: string | null
          duration_days?: number | null
          editing_permissions?: string
          end_at?: string | null
          exclusivity?: boolean
          exclusivity_end_at?: string | null
          exclusivity_scope?: string | null
          fee_cents?: number | null
          id?: string
          notes?: string
          opportunity_id?: string | null
          organic_allowed?: boolean
          paid_allowed?: boolean
          platforms?: string[]
          portfolio_permission?: boolean | null
          quote_id?: string | null
          raw_footage?: boolean
          renewed_into_id?: string | null
          start_at?: string | null
          status?: string
          territories?: string[]
          third_party_usage?: boolean
          updated_at?: string
          whitelisting?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rights_license_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_collaboration_fk"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "collaboration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_content_fk"
            columns: ["content_asset_id"]
            isOneToOne: false
            referencedRelation: "content_asset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_document_fk"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_license_renewed_into_id_fkey"
            columns: ["renewed_into_id"]
            isOneToOne: false
            referencedRelation: "rights_license"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_message: {
        Row: {
          body_hash: string
          body_text: string
          direction: string
          external_message_id: string
          from_address: string
          from_name: string
          id: string
          ingested_at: string
          processed_at: string | null
          provider: string
          raw_ref: string | null
          sent_at: string
          snippet: string
          subject: string
          thread_id: string
          to_addresses: string[]
        }
        Insert: {
          body_hash?: string
          body_text?: string
          direction: string
          external_message_id: string
          from_address?: string
          from_name?: string
          id?: string
          ingested_at?: string
          processed_at?: string | null
          provider: string
          raw_ref?: string | null
          sent_at: string
          snippet?: string
          subject?: string
          thread_id: string
          to_addresses?: string[]
        }
        Update: {
          body_hash?: string
          body_text?: string
          direction?: string
          external_message_id?: string
          from_address?: string
          from_name?: string
          id?: string
          ingested_at?: string
          processed_at?: string | null
          provider?: string
          raw_ref?: string | null
          sent_at?: string
          snippet?: string
          subject?: string
          thread_id?: string
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "source_message_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "source_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      source_thread: {
        Row: {
          brand_id: string | null
          classification: string
          classification_confidence: number | null
          classification_reason: string
          connection_id: string | null
          contact_id: string | null
          created_at: string
          external_thread_id: string
          id: string
          last_message_at: string | null
          message_count: number
          opportunity_id: string | null
          participants: string[]
          provider: string
          subject: string
          summary: string
          sync_cursor: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          classification?: string
          classification_confidence?: number | null
          classification_reason?: string
          connection_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_thread_id: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          opportunity_id?: string | null
          participants?: string[]
          provider: string
          subject?: string
          summary?: string
          sync_cursor?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          classification?: string
          classification_confidence?: number | null
          classification_reason?: string
          connection_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_thread_id?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          opportunity_id?: string | null
          participants?: string[]
          provider?: string
          subject?: string
          summary?: string
          sync_cursor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_thread_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_thread_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_thread_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_thread_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_intel: {
        Row: {
          brand_id: string | null
          created_at: string
          draft_body: string
          draft_language: string
          draft_reason: string
          draft_run_id: string | null
          draft_state: string
          draft_subject: string
          failure: string | null
          id: string
          intent: string
          intent_confidence: number | null
          last_carol_message_id: string | null
          last_external_message_id: string | null
          opportunity_id: string | null
          prepared_at: string | null
          recommendation: string
          risk: string
          risk_level: string
          secondary_intents: Json
          source_fingerprint: string
          thread_id: string
          updated_at: string
          waiting_on: string
          waiting_since: string | null
          what_changed: string
          what_is_missing: string
          what_they_want: string
          who_wrote: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          draft_body?: string
          draft_language?: string
          draft_reason?: string
          draft_run_id?: string | null
          draft_state?: string
          draft_subject?: string
          failure?: string | null
          id?: string
          intent?: string
          intent_confidence?: number | null
          last_carol_message_id?: string | null
          last_external_message_id?: string | null
          opportunity_id?: string | null
          prepared_at?: string | null
          recommendation?: string
          risk?: string
          risk_level?: string
          secondary_intents?: Json
          source_fingerprint?: string
          thread_id: string
          updated_at?: string
          waiting_on?: string
          waiting_since?: string | null
          what_changed?: string
          what_is_missing?: string
          what_they_want?: string
          who_wrote?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          draft_body?: string
          draft_language?: string
          draft_reason?: string
          draft_run_id?: string | null
          draft_state?: string
          draft_subject?: string
          failure?: string | null
          id?: string
          intent?: string
          intent_confidence?: number | null
          last_carol_message_id?: string | null
          last_external_message_id?: string | null
          opportunity_id?: string | null
          prepared_at?: string | null
          recommendation?: string
          risk?: string
          risk_level?: string
          secondary_intents?: Json
          source_fingerprint?: string
          thread_id?: string
          updated_at?: string
          waiting_on?: string
          waiting_since?: string | null
          what_changed?: string
          what_is_missing?: string
          what_they_want?: string
          who_wrote?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_intel_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_intel_draft_run_id_fkey"
            columns: ["draft_run_id"]
            isOneToOne: false
            referencedRelation: "ai_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_intel_last_carol_message_id_fkey"
            columns: ["last_carol_message_id"]
            isOneToOne: false
            referencedRelation: "source_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_intel_last_external_message_id_fkey"
            columns: ["last_external_message_id"]
            isOneToOne: false
            referencedRelation: "source_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_intel_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_intel_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "source_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_memory: {
        Row: {
          ai_text: string
          brand_id: string | null
          created_at: string
          final_text: string
          id: string
          kind: string
          language: string
          observations: Json
          thread_id: string | null
        }
        Insert: {
          ai_text?: string
          brand_id?: string | null
          created_at?: string
          final_text?: string
          id?: string
          kind: string
          language?: string
          observations?: Json
          thread_id?: string | null
        }
        Update: {
          ai_text?: string
          brand_id?: string | null
          created_at?: string
          final_text?: string
          id?: string
          kind?: string
          language?: string
          observations?: Json
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_memory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_memory_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "source_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      zz_backup_outreach_candidate_20260901: {
        Row: {
          ai_body: string | null
          ai_subject: string | null
          body: string | null
          brand_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_role: string | null
          contact_source: string | null
          content_ideas: Json | null
          country: string | null
          created_at: string | null
          creative_opportunity: string | null
          domain: string | null
          email_confidence: string | null
          fit_band: string | null
          fit_breakdown: Json | null
          fit_score: number | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string | null
          language: string | null
          name: string | null
          niche_id: string | null
          normalized_name: string | null
          opportunity_id: string | null
          paid_media_signal: string | null
          portfolio_match: Json | null
          product: string | null
          quality: Json | null
          rank: number | null
          red_flags: Json | null
          reject_reason: string | null
          researched_at: string | null
          risk: string | null
          run_id: string | null
          sent_at: string | null
          socials: Json | null
          sources: Json | null
          status: string | null
          subject: string | null
          ugc_signal: string | null
          updated_at: string | null
          website: string | null
          why_fit: string | null
          why_may_pay: string | null
          why_now: string | null
        }
        Insert: {
          ai_body?: string | null
          ai_subject?: string | null
          body?: string | null
          brand_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          contact_source?: string | null
          content_ideas?: Json | null
          country?: string | null
          created_at?: string | null
          creative_opportunity?: string | null
          domain?: string | null
          email_confidence?: string | null
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_score?: number | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string | null
          language?: string | null
          name?: string | null
          niche_id?: string | null
          normalized_name?: string | null
          opportunity_id?: string | null
          paid_media_signal?: string | null
          portfolio_match?: Json | null
          product?: string | null
          quality?: Json | null
          rank?: number | null
          red_flags?: Json | null
          reject_reason?: string | null
          researched_at?: string | null
          risk?: string | null
          run_id?: string | null
          sent_at?: string | null
          socials?: Json | null
          sources?: Json | null
          status?: string | null
          subject?: string | null
          ugc_signal?: string | null
          updated_at?: string | null
          website?: string | null
          why_fit?: string | null
          why_may_pay?: string | null
          why_now?: string | null
        }
        Update: {
          ai_body?: string | null
          ai_subject?: string | null
          body?: string | null
          brand_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          contact_source?: string | null
          content_ideas?: Json | null
          country?: string | null
          created_at?: string | null
          creative_opportunity?: string | null
          domain?: string | null
          email_confidence?: string | null
          fit_band?: string | null
          fit_breakdown?: Json | null
          fit_score?: number | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string | null
          language?: string | null
          name?: string | null
          niche_id?: string | null
          normalized_name?: string | null
          opportunity_id?: string | null
          paid_media_signal?: string | null
          portfolio_match?: Json | null
          product?: string | null
          quality?: Json | null
          rank?: number | null
          red_flags?: Json | null
          reject_reason?: string | null
          researched_at?: string | null
          risk?: string | null
          run_id?: string | null
          sent_at?: string | null
          socials?: Json | null
          sources?: Json | null
          status?: string | null
          subject?: string | null
          ugc_signal?: string | null
          updated_at?: string | null
          website?: string | null
          why_fit?: string | null
          why_may_pay?: string | null
          why_now?: string | null
        }
        Relationships: []
      }
      zz_backup_outreach_run_20260901: {
        Row: {
          app_user_id: string | null
          discovered: number | null
          error: string | null
          finished_at: string | null
          id: string | null
          input_tokens: number | null
          kind: string | null
          output_tokens: number | null
          partial_failures: Json | null
          researched: number | null
          run_date: string | null
          screened: number | null
          selected: number | null
          started_at: string | null
          status: string | null
          strategy: Json | null
        }
        Insert: {
          app_user_id?: string | null
          discovered?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string | null
          input_tokens?: number | null
          kind?: string | null
          output_tokens?: number | null
          partial_failures?: Json | null
          researched?: number | null
          run_date?: string | null
          screened?: number | null
          selected?: number | null
          started_at?: string | null
          status?: string | null
          strategy?: Json | null
        }
        Update: {
          app_user_id?: string | null
          discovered?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string | null
          input_tokens?: number | null
          kind?: string | null
          output_tokens?: number | null
          partial_failures?: Json | null
          researched?: number | null
          run_date?: string | null
          screened?: number | null
          selected?: number | null
          started_at?: string | null
          status?: string | null
          strategy?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      carolos_apply_schedule: {
        Args: never
        Returns: {
          job_name: string
          schedule: string
        }[]
      }
      carolos_clear_schedule: { Args: never; Returns: number }
      carolos_dispatch_job: { Args: { p_job: string }; Returns: string }
      carolos_normalize: { Args: { v: string }; Returns: string }
      carolos_reconcile_dispatches: { Args: never; Returns: number }
      carolos_schedule_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          job_name: string
          last_dispatch: string
          last_error: string
          last_status: string
          processed_count: number
          schedule: string
        }[]
      }
      carolos_set_cron_secret: {
        Args: { p_secret: string }
        Returns: undefined
      }
      carolos_should_dispatch: { Args: { p_job: string }; Returns: boolean }
      carolos_user_id: { Args: never; Returns: string }
      is_carolos_user: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
