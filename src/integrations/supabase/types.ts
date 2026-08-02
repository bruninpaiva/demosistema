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
      admin_users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          failed_login_attempts: number
          id: string
          last_login_at: string | null
          locked_until: string | null
          must_change_password: boolean
          name: string
          password_changed_at: string | null
          password_hash: string
          password_reset_expires_at: string | null
          password_reset_token: string | null
          recovery_codes: Json
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string | null
          two_factor_enabled: boolean
          two_factor_secret: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          failed_login_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          must_change_password?: boolean
          name: string
          password_changed_at?: string | null
          password_hash: string
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          recovery_codes?: Json
          role?: Database["public"]["Enums"]["admin_role"]
          store_id?: string | null
          two_factor_enabled?: boolean
          two_factor_secret?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          failed_login_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          must_change_password?: boolean
          name?: string
          password_changed_at?: string | null
          password_hash?: string
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          recovery_codes?: Json
          role?: Database["public"]["Enums"]["admin_role"]
          store_id?: string | null
          two_factor_enabled?: boolean
          two_factor_secret?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_managers: {
        Row: {
          access_enabled: boolean
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_enabled?: boolean
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_enabled?: boolean
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_managers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          amount: number | null
          closed_at: string | null
          created_at: string
          id: string
          notes: string | null
          reason_id: string | null
          reason_other_text: string | null
          sales_rep_id: string
          status: string
          store_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason_id?: string | null
          reason_other_text?: string | null
          sales_rep_id: string
          status?: string
          store_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason_id?: string | null
          reason_other_text?: string | null
          sales_rep_id?: string
          status?: string
          store_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "no_sale_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_imports: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          commission_config: Json
          created_at: string
          id: string
          imported_by: string | null
          meta_amount: number
          month: number
          store_id: string
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          commission_config?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meta_amount?: number
          month: number
          store_id: string
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          commission_config?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meta_amount?: number
          month?: number
          store_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rows: {
        Row: {
          bruto: number
          consentimentos: number
          created_at: string
          desc_pct: number
          desconto: number
          id: string
          import_id: string
          liquido: number
          nome: string
          pa: number
          pm: number
          tm: number
          uni: number
          vendas: number
          vendas_com: number
          vendas_sem: number
        }
        Insert: {
          bruto?: number
          consentimentos?: number
          created_at?: string
          desc_pct?: number
          desconto?: number
          id?: string
          import_id: string
          liquido?: number
          nome: string
          pa?: number
          pm?: number
          tm?: number
          uni?: number
          vendas?: number
          vendas_com?: number
          vendas_sem?: number
        }
        Update: {
          bruto?: number
          consentimentos?: number
          created_at?: string
          desc_pct?: number
          desconto?: number
          id?: string
          import_id?: string
          liquido?: number
          nome?: string
          pa?: number
          pm?: number
          tm?: number
          uni?: number
          vendas?: number
          vendas_com?: number
          vendas_sem?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "commission_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      no_sale_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_other: boolean
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      promo_exports: {
        Row: {
          created_at: string
          csv_content: string
          discount: number
          file_name: string
          filters: Json
          id: string
          product_count: number
        }
        Insert: {
          created_at?: string
          csv_content: string
          discount: number
          file_name: string
          filters?: Json
          id?: string
          product_count: number
        }
        Update: {
          created_at?: string
          csv_content?: string
          discount?: number
          file_name?: string
          filters?: Json
          id?: string
          product_count?: number
        }
        Relationships: []
      }
      rep_breaks: {
        Row: {
          break_type: string
          ended_at: string | null
          id: string
          reason: string | null
          sales_rep_id: string
          started_at: string
          store_id: string | null
        }
        Insert: {
          break_type: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          sales_rep_id: string
          started_at?: string
          store_id?: string | null
        }
        Update: {
          break_type?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          sales_rep_id?: string
          started_at?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_breaks_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_breaks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          queue_position: number | null
          status: string
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          queue_position?: number | null
          status?: string
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          queue_position?: number | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          created_at: string
          id: string
          manager_id: string | null
          name: string
          pin: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          pin: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          pin?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "store_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      store_operating_hours: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          is_open: boolean
          opens_at: string
          store_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at?: string
          created_at?: string
          id?: string
          is_open?: boolean
          opens_at?: string
          store_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          is_open?: boolean
          opens_at?: string
          store_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_operating_hours_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_2fa_disable: {
        Args: { _actor: string; _actor_password: string }
        Returns: undefined
      }
      admin_2fa_setup_init: {
        Args: { _actor: string; _actor_password: string }
        Returns: { otpauth_url: string; secret: string }[]
      }
      admin_2fa_setup_verify: {
        Args: { _actor: string; _actor_password: string; _code: string }
        Returns: string[]
      }
      admin_authenticate: {
        Args: { _code?: string; _email: string; _password: string }
        Returns: {
          email: string | null
          id: string | null
          locked_seconds: number | null
          must_change_password: boolean | null
          name: string | null
          role: Database["public"]["Enums"]["admin_role"] | null
          status: string
          store_id: string | null
          two_factor_enabled: boolean | null
        }[]
      }
      admin_force_disable_2fa: {
        Args: { _actor: string; _actor_password: string; _target_id: string }
        Returns: undefined
      }
      admin_bootstrap: {
        Args: { _email: string; _name: string; _password: string }
        Returns: string
      }
      admin_change_own_password: {
        Args: { _current_password: string; _email: string; _new_password: string }
        Returns: undefined
      }
      admin_request_password_reset: {
        Args: { _email: string }
        Returns: string
      }
      admin_reset_password: {
        Args: { _new_password: string; _token: string }
        Returns: boolean
      }
      admin_create: {
        Args: {
          _actor: string
          _actor_password: string
          _email: string
          _name: string
          _password: string
          _require_password_change?: boolean
          _role?: Database["public"]["Enums"]["admin_role"]
          _store_id?: string
        }
        Returns: string
      }
      admin_delete: {
        Args: { _actor: string; _actor_password: string; _id: string }
        Returns: undefined
      }
      admin_exists: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      admin_list: {
        Args: { _actor: string; _actor_password: string }
        Returns: {
          active: boolean
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          locked_until: string | null
          must_change_password: boolean
          name: string
          password_changed_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string
          two_factor_enabled: boolean
          updated_at: string
        }[]
      }
      admin_unlock: {
        Args: { _actor: string; _actor_password: string; _target_id: string }
        Returns: undefined
      }
      admin_record_login: {
        Args: { _email: string; _password: string }
        Returns: undefined
      }
      admin_set_active: {
        Args: { _actor: string; _actor_password: string; _active: boolean; _id: string }
        Returns: undefined
      }
      admin_update: {
        Args: {
          _actor: string
          _actor_password: string
          _id: string
          _new_email: string
          _new_name: string
          _new_password: string
          _new_role?: Database["public"]["Enums"]["admin_role"]
          _new_store_id?: string
          _require_password_change?: boolean
        }
        Returns: undefined
      }
      close_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      delete_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      get_commission_full: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: Json
      }
      get_commission_summary: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_commission_imports: {
        Args: { _actor: string; _actor_password: string }
        Returns: {
          closed_at: string
          closed_by: string
          id: string
          imported_by: string
          meta_amount: number
          month: number
          store_id: string
          store_name: string
          updated_at: string
          year: number
        }[]
      }
      reopen_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      save_commission_import: {
        Args: {
          _actor: string
          _actor_password: string
          _config: Json
          _meta: number
          _month: number
          _rows: Json
          _store_id: string
          _year: number
        }
        Returns: string
      }
      send_to_end_of_queue: { Args: { _rep_id: string }; Returns: undefined }
      verify_admin: {
        Args: { _email: string; _password: string }
        Returns: boolean
      }
      verify_admin_user: {
        Args: { _email: string; _password: string }
        Returns: {
          email: string
          id: string
          must_change_password: boolean
          name: string
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string
        }[]
      }
      verify_store_pin: {
        Args: { _pin: string; _store_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_role: "admin" | "gerente" | "super_admin"
      app_role: "admin" | "operator"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role: ["admin", "gerente", "super_admin"],
      app_role: ["admin", "operator"],
    },
  },
} as const
