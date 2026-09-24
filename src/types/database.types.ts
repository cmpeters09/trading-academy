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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      candles: {
        Row: {
          close: number
          high: number
          instrument_id: string
          low: number
          open: number
          timeframe: string
          ts: string
          volume: number
        }
        Insert: {
          close: number
          high: number
          instrument_id: string
          low: number
          open: number
          timeframe: string
          ts: string
          volume?: number
        }
        Update: {
          close?: number
          high?: number
          instrument_id?: string
          low?: number
          open?: number
          timeframe?: string
          ts?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "candles_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_segments: {
        Row: {
          description: string | null
          difficulty: string | null
          ends_at: string
          id: string
          instrument_id: string
          starts_at: string
          tags: string[]
          timeframe: string
          title: string
        }
        Insert: {
          description?: string | null
          difficulty?: string | null
          ends_at: string
          id?: string
          instrument_id: string
          starts_at: string
          tags?: string[]
          timeframe: string
          title: string
        }
        Update: {
          description?: string | null
          difficulty?: string | null
          ends_at?: string
          id?: string
          instrument_id?: string
          starts_at?: string
          tags?: string[]
          timeframe?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_segments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      executions: {
        Row: {
          commission: number
          engine_version: string
          fill_price: number
          fill_ts: string
          id: string
          order_id: string
          quantity: number
          slippage: number
        }
        Insert: {
          commission?: number
          engine_version: string
          fill_price: number
          fill_ts: string
          id?: string
          order_id: string
          quantity: number
          slippage?: number
        }
        Update: {
          commission?: number
          engine_version?: string
          fill_price?: number
          fill_ts?: string
          id?: string
          order_id?: string
          quantity?: number
          slippage?: number
        }
        Relationships: [
          {
            foreignKeyName: "executions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          asset_class: string
          currency: string
          id: string
          is_active: boolean
          name: string
          point_value: number
          symbol: string
          tick_size: number
        }
        Insert: {
          asset_class: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          point_value?: number
          symbol: string
          tick_size?: number
        }
        Update: {
          asset_class?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          point_value?: number
          symbol?: string
          tick_size?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          limit_price: number | null
          placed_at_ts: string
          quantity: number
          replay_session_id: string | null
          side: string
          sim_account_id: string
          status: string
          stop_price: number | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          limit_price?: number | null
          placed_at_ts: string
          quantity: number
          replay_session_id?: string | null
          side: string
          sim_account_id: string
          status?: string
          stop_price?: number | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          limit_price?: number | null
          placed_at_ts?: string
          quantity?: number
          replay_session_id?: string | null
          side?: string
          sim_account_id?: string
          status?: string
          stop_price?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sim_account_id_fkey"
            columns: ["sim_account_id"]
            isOneToOne: false
            referencedRelation: "sim_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarded_at: string | null
          timezone: string
          updated_at: string
          username: string
          xp_total: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarded_at?: string | null
          timezone?: string
          updated_at?: string
          username: string
          xp_total?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarded_at?: string | null
          timezone?: string
          updated_at?: string
          username?: string
          xp_total?: number
        }
        Relationships: []
      }
      sim_accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          is_default: boolean
          name: string
          starting_balance: number
          user_id: string
        }
        Insert: {
          balance: number
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name?: string
          starting_balance?: number
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name?: string
          starting_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_orders: {
        Row: {
          order_id: string
          trade_id: string
        }
        Insert: {
          order_id: string
          trade_id: string
        }
        Update: {
          order_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_orders_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          avg_entry: number
          avg_exit: number
          created_at: string
          deleted_at: string | null
          direction: string
          engine_version: string
          entry_ts: string
          exit_ts: string
          fees: number
          gross_pnl: number
          id: string
          instrument_id: string
          net_pnl: number
          planned_stop: number | null
          planned_target: number | null
          quantity: number
          r_multiple: number | null
          replay_session_id: string | null
          sim_account_id: string
          user_id: string
        }
        Insert: {
          avg_entry: number
          avg_exit: number
          created_at?: string
          deleted_at?: string | null
          direction: string
          engine_version: string
          entry_ts: string
          exit_ts: string
          fees?: number
          gross_pnl: number
          id?: string
          instrument_id: string
          net_pnl: number
          planned_stop?: number | null
          planned_target?: number | null
          quantity: number
          r_multiple?: number | null
          replay_session_id?: string | null
          sim_account_id: string
          user_id: string
        }
        Update: {
          avg_entry?: number
          avg_exit?: number
          created_at?: string
          deleted_at?: string | null
          direction?: string
          engine_version?: string
          entry_ts?: string
          exit_ts?: string
          fees?: number
          gross_pnl?: number
          id?: string
          instrument_id?: string
          net_pnl?: number
          planned_stop?: number | null
          planned_target?: number | null
          quantity?: number
          r_multiple?: number | null
          replay_session_id?: string | null
          sim_account_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_sim_account_id_fkey"
            columns: ["sim_account_id"]
            isOneToOne: false
            referencedRelation: "sim_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          default_commission: number
          default_risk_pct: number
          default_slippage_bp: number
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          default_commission?: number
          default_risk_pct?: number
          default_slippage_bp?: number
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          default_commission?: number
          default_risk_pct?: number
          default_slippage_bp?: number
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
