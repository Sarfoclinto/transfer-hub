export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      access_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          ip_hash: string | null;
          item_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          ip_hash?: string | null;
          item_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          ip_hash?: string | null;
          item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "access_events_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          download_count: number;
          id: string;
          kind: string;
          mime_type: string | null;
          one_time: boolean;
          order_index: number;
          original_filename: string | null;
          session_id: string;
          size_bytes: number | null;
          status: string;
          storage_key: string | null;
          text_content: string | null;
          text_language: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          download_count?: number;
          id?: string;
          kind: string;
          mime_type?: string | null;
          one_time?: boolean;
          order_index?: number;
          original_filename?: string | null;
          session_id: string;
          size_bytes?: number | null;
          status?: string;
          storage_key?: string | null;
          text_content?: string | null;
          text_language?: string | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          download_count?: number;
          id?: string;
          kind?: string;
          mime_type?: string | null;
          one_time?: boolean;
          order_index?: number;
          original_filename?: string | null;
          session_id?: string;
          size_bytes?: number | null;
          status?: string;
          storage_key?: string | null;
          text_content?: string | null;
          text_language?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "items_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          plan: string;
          storage_used_bytes: number;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          plan?: string;
          storage_used_bytes?: number;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          plan?: string;
          storage_used_bytes?: number;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          expires_at: string | null;
          id: string;
          owner_id: string | null;
          owner_token_hash: string | null;
          password_hash: string | null;
          title: string | null;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          expires_at?: string | null;
          id?: string;
          owner_id?: string | null;
          owner_token_hash?: string | null;
          password_hash?: string | null;
          title?: string | null;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          expires_at?: string | null;
          id?: string;
          owner_id?: string | null;
          owner_token_hash?: string | null;
          password_hash?: string | null;
          title?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
