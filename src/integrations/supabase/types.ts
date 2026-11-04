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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          company_address: string
          company_name: string
          company_phone: string | null
          default_trade_discount_pct: number
          enforce_credit_limit: boolean
          extra_discount_max_pct: number
          extra_discount_so_limit_pct: number
          id: number
          near_expiry_days: number
          so_discount_max_pct: number
          updated_at: string
        }
        Insert: {
          company_address?: string
          company_name?: string
          company_phone?: string | null
          default_trade_discount_pct?: number
          enforce_credit_limit?: boolean
          extra_discount_max_pct?: number
          extra_discount_so_limit_pct?: number
          id?: number
          near_expiry_days?: number
          so_discount_max_pct?: number
          updated_at?: string
        }
        Update: {
          company_address?: string
          company_name?: string
          company_phone?: string | null
          default_trade_discount_pct?: number
          enforce_credit_limit?: boolean
          extra_discount_max_pct?: number
          extra_discount_so_limit_pct?: number
          id?: number
          near_expiry_days?: number
          so_discount_max_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_no: string
          created_at: string
          expiry_date: string
          id: string
          mfg_date: string | null
          product_id: string
        }
        Insert: {
          batch_no: string
          created_at?: string
          expiry_date: string
          id?: string
          mfg_date?: string | null
          product_id: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          expiry_date?: string
          id?: string
          mfg_date?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      chemists: {
        Row: {
          address: string | null
          alternate_mobile: string | null
          assigned_so: string | null
          business_name: string
          code: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          district: string | null
          division: string | null
          drug_license_no: string | null
          id: string
          latitude: number | null
          longitude: number | null
          mobile: string | null
          owner_name: string | null
          payment_terms_days: number
          route: string | null
          status: string
          territory_id: string | null
          upazila: string | null
        }
        Insert: {
          address?: string | null
          alternate_mobile?: string | null
          assigned_so?: string | null
          business_name: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          district?: string | null
          division?: string | null
          drug_license_no?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mobile?: string | null
          owner_name?: string | null
          payment_terms_days?: number
          route?: string | null
          status?: string
          territory_id?: string | null
          upazila?: string | null
        }
        Update: {
          address?: string | null
          alternate_mobile?: string | null
          assigned_so?: string | null
          business_name?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          district?: string | null
          division?: string | null
          drug_license_no?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mobile?: string | null
          owner_name?: string | null
          payment_terms_days?: number
          route?: string | null
          status?: string
          territory_id?: string | null
          upazila?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chemists_assigned_so_fkey"
            columns: ["assigned_so"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chemists_assigned_so_fkey"
            columns: ["assigned_so"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
          {
            foreignKeyName: "chemists_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          amount: number
          chemist_id: string
          collection_date: string
          collection_no: string
          created_at: string
          id: string
          idempotency_key: string | null
          method: string
          order_id: string
          reference: string | null
          remarks: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          so_id: string
          status: string
        }
        Insert: {
          amount: number
          chemist_id: string
          collection_date?: string
          collection_no: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method: string
          order_id: string
          reference?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          so_id: string
          status?: string
        }
        Update: {
          amount?: number
          chemist_id?: string
          collection_date?: string
          collection_no?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method?: string
          order_id?: string
          reference?: string | null
          remarks?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          so_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_chemist_id_fkey"
            columns: ["chemist_id"]
            isOneToOne: false
            referencedRelation: "chemists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      deliveries: {
        Row: {
          chemist_id: string
          created_at: string
          delivery_date: string
          delivery_no: string
          delivery_type: string
          id: string
          idempotency_key: string | null
          order_id: string
          remarks: string | null
          so_id: string
          total_value: number
        }
        Insert: {
          chemist_id: string
          created_at?: string
          delivery_date?: string
          delivery_no: string
          delivery_type: string
          id?: string
          idempotency_key?: string | null
          order_id: string
          remarks?: string | null
          so_id: string
          total_value?: number
        }
        Update: {
          chemist_id?: string
          created_at?: string
          delivery_date?: string
          delivery_no?: string
          delivery_type?: string
          id?: string
          idempotency_key?: string | null
          order_id?: string
          remarks?: string | null
          so_id?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_chemist_id_fkey"
            columns: ["chemist_id"]
            isOneToOne: false
            referencedRelation: "chemists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          batch_id: string
          delivery_id: string
          id: string
          line_value: number
          mrp: number
          net_unit_price: number
          order_item_id: string
          product_id: string
          qty: number
        }
        Insert: {
          batch_id: string
          delivery_id: string
          id?: string
          line_value: number
          mrp: number
          net_unit_price: number
          order_item_id: string
          product_id: string
          qty: number
        }
        Update: {
          batch_id?: string
          delivery_id?: string
          id?: string
          line_value?: number
          mrp?: number
          net_unit_price?: number
          order_item_id?: string
          product_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          account_ref: string | null
          amount: number
          attachment_path: string | null
          created_at: string
          deposit_date: string
          deposit_no: string
          id: string
          idempotency_key: string | null
          method: string
          provider: string | null
          receipt_no: string | null
          received_by: string | null
          rejection_reason: string | null
          remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          so_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          account_ref?: string | null
          amount: number
          attachment_path?: string | null
          created_at?: string
          deposit_date?: string
          deposit_no: string
          id?: string
          idempotency_key?: string | null
          method: string
          provider?: string | null
          receipt_no?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          so_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          account_ref?: string | null
          amount?: number
          attachment_path?: string | null
          created_at?: string
          deposit_date?: string
          deposit_no?: string
          id?: string
          idempotency_key?: string | null
          method?: string
          provider?: string | null
          receipt_no?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          so_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      doc_counters: {
        Row: {
          last_no: number
          prefix: string
          yr: number
        }
        Insert: {
          last_no?: number
          prefix: string
          yr: number
        }
        Update: {
          last_no?: number
          prefix?: string
          yr?: number
        }
        Relationships: []
      }
      doctor_visits: {
        Row: {
          created_at: string
          doctor_id: string
          end_time: string | null
          id: string
          idempotency_key: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          purpose: string | null
          so_id: string
          start_time: string | null
          visit_date: string
          visit_no: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          end_time?: string | null
          id?: string
          idempotency_key?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          purpose?: string | null
          so_id: string
          start_time?: string | null
          visit_date?: string
          visit_no: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          end_time?: string | null
          id?: string
          idempotency_key?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          purpose?: string | null
          so_id?: string
          start_time?: string | null
          visit_date?: string
          visit_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_visits_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_visits_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      doctors: {
        Row: {
          address: string | null
          assigned_so: string | null
          chamber: string | null
          code: string | null
          created_at: string
          created_by: string | null
          hospital: string | null
          id: string
          latitude: number | null
          longitude: number | null
          mobile: string | null
          name: string
          qualification: string | null
          speciality: string | null
          status: string
          territory_id: string | null
        }
        Insert: {
          address?: string | null
          assigned_so?: string | null
          chamber?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          hospital?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mobile?: string | null
          name: string
          qualification?: string | null
          speciality?: string | null
          status?: string
          territory_id?: string | null
        }
        Update: {
          address?: string | null
          assigned_so?: string | null
          chamber?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          hospital?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mobile?: string | null
          name?: string
          qualification?: string | null
          speciality?: string | null
          status?: string
          territory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_assigned_so_fkey"
            columns: ["assigned_so"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_assigned_so_fkey"
            columns: ["assigned_so"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
          {
            foreignKeyName: "doctors_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          expense_no: string
          id: string
          idempotency_key: string | null
          receipt_paths: string[]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          expense_date?: string
          expense_no: string
          id?: string
          idempotency_key?: string | null
          receipt_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          expense_no?: string
          id?: string
          idempotency_key?: string | null
          receipt_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          so_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          so_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          so_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          base_trp: number
          delivered_qty: number
          id: string
          line_mrp: number
          line_net: number
          line_trp: number
          mrp: number
          net_unit_price: number
          order_id: string
          product_id: string
          qty: number
          trade_discount_pct: number
        }
        Insert: {
          base_trp: number
          delivered_qty?: number
          id?: string
          line_mrp: number
          line_net: number
          line_trp: number
          mrp: number
          net_unit_price: number
          order_id: string
          product_id: string
          qty: number
          trade_discount_pct: number
        }
        Update: {
          base_trp?: number
          delivered_qty?: number
          id?: string
          line_mrp?: number
          line_net?: number
          line_trp?: number
          mrp?: number
          net_unit_price?: number
          order_id?: string
          product_id?: string
          qty?: number
          trade_discount_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          chemist_id: string
          collected_value: number
          created_at: string
          delivered_value: number
          delivery_status: string
          due: number | null
          extra_discount_amt: number
          extra_discount_pct: number
          first_delivered_at: string | null
          id: string
          idempotency_key: string | null
          net_total: number
          order_date: string
          order_no: string
          payment_status: string
          remarks: string | null
          so_discount_amt: number
          so_discount_pct: number
          so_id: string
          status: string
          total_base_trp: number
          total_mrp: number
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          chemist_id: string
          collected_value?: number
          created_at?: string
          delivered_value?: number
          delivery_status?: string
          due?: number | null
          extra_discount_amt?: number
          extra_discount_pct?: number
          first_delivered_at?: string | null
          id?: string
          idempotency_key?: string | null
          net_total?: number
          order_date?: string
          order_no: string
          payment_status?: string
          remarks?: string | null
          so_discount_amt?: number
          so_discount_pct?: number
          so_id: string
          status?: string
          total_base_trp?: number
          total_mrp?: number
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          chemist_id?: string
          collected_value?: number
          created_at?: string
          delivered_value?: number
          delivery_status?: string
          due?: number | null
          extra_discount_amt?: number
          extra_discount_pct?: number
          first_delivered_at?: string | null
          id?: string
          idempotency_key?: string | null
          net_total?: number
          order_date?: string
          order_no?: string
          payment_status?: string
          remarks?: string | null
          so_discount_amt?: number
          so_discount_pct?: number
          so_id?: string
          status?: string
          total_base_trp?: number
          total_mrp?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_chemist_id_fkey"
            columns: ["chemist_id"]
            isOneToOne: false
            referencedRelation: "chemists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_trp: number | null
          category: string | null
          code: string
          created_at: string
          dosage_form: string | null
          generic_name: string | null
          id: string
          kind: string
          mrp: number
          name: string
          pack_size: string | null
          reorder_level: number
          strength: string | null
          trade_discount_pct: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_trp?: number | null
          category?: string | null
          code: string
          created_at?: string
          dosage_form?: string | null
          generic_name?: string | null
          id?: string
          kind?: string
          mrp?: number
          name: string
          pack_size?: string | null
          reorder_level?: number
          strength?: string | null
          trade_discount_pct?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_trp?: number | null
          category?: string | null
          code?: string
          created_at?: string
          dosage_form?: string | null
          generic_name?: string | null
          id?: string
          kind?: string
          mrp?: number
          name?: string
          pack_size?: string | null
          reorder_level?: number
          strength?: string | null
          trade_discount_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          so_code: string | null
          territory_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          so_code?: string | null
          territory_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          so_code?: string | null
          territory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_items: {
        Row: {
          approved_qty: number | null
          id: string
          issued_qty: number
          product_id: string
          requested_qty: number
          requisition_id: string
        }
        Insert: {
          approved_qty?: number | null
          id?: string
          issued_qty?: number
          product_id: string
          requested_qty: number
          requisition_id: string
        }
        Update: {
          approved_qty?: number | null
          id?: string
          issued_qty?: number
          product_id?: string
          requested_qty?: number
          requisition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          received_at: string | null
          remarks: string | null
          req_no: string
          so_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          received_at?: string | null
          remarks?: string | null
          req_no: string
          so_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          received_at?: string | null
          remarks?: string | null
          req_no?: string
          so_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          batch_id: string
          location_id: string
          product_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          batch_id: string
          location_id: string
          product_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string
          location_id?: string
          product_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_id: string
          from_location: string | null
          id: number
          movement_type: string
          performed_at: string
          performed_by: string | null
          product_id: string
          qty: number
          reference_id: string | null
          reference_no: string | null
          reference_type: string | null
          remarks: string | null
          to_location: string | null
        }
        Insert: {
          batch_id: string
          from_location?: string | null
          id?: number
          movement_type: string
          performed_at?: string
          performed_by?: string | null
          product_id: string
          qty: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          remarks?: string | null
          to_location?: string | null
        }
        Update: {
          batch_id?: string
          from_location?: string | null
          id?: number
          movement_type?: string
          performed_at?: string
          performed_by?: string | null
          product_id?: string
          qty?: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          remarks?: string | null
          to_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          area: string | null
          created_at: string
          id: string
          name: string
          zone: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          id?: string
          name: string
          zone?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          id?: string
          name?: string
          zone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_items: {
        Row: {
          batch_id: string
          id: string
          product_id: string
          qty: number
          visit_id: string
        }
        Insert: {
          batch_id: string
          id?: string
          product_id: string
          qty: number
          visit_id: string
        }
        Update: {
          batch_id?: string
          id?: string
          product_id?: string
          qty?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "doctor_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_type: string
          id: number
          note: string | null
          reference_id: string | null
          reference_no: string | null
          reference_type: string | null
          so_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_type: string
          id?: number
          note?: string | null
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          so_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_type?: string
          id?: number
          note?: string | null
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          so_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_summary"
            referencedColumns: ["so_id"]
          },
        ]
      }
    }
    Views: {
      v_stock: {
        Row: {
          base_trp: number | null
          batch_id: string | null
          batch_no: string | null
          days_to_expiry: number | null
          expiry_date: string | null
          location_id: string | null
          location_kind: string | null
          location_name: string | null
          mfg_date: string | null
          mrp: number | null
          product_code: string | null
          product_id: string | null
          product_kind: string | null
          product_name: string | null
          qty: number | null
          reorder_level: number | null
          so_id: string | null
          value_trp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_wallet_summary: {
        Row: {
          balance: number | null
          full_name: string | null
          pending: number | null
          settled: number | null
          so_code: string | null
          so_id: string | null
          total_collected: number | null
        }
        Insert: {
          balance?: never
          full_name?: string | null
          pending?: never
          settled?: never
          so_code?: string | null
          so_id?: string | null
          total_collected?: never
        }
        Update: {
          balance?: never
          full_name?: string | null
          pending?: never
          settled?: never
          so_code?: string | null
          so_id?: string | null
          total_collected?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _allocate_fefo: {
        Args: { p_location: string; p_product: string; p_qty: number }
        Returns: {
          o_batch_id: string
          o_qty: number
        }[]
      }
      _audit: {
        Args: {
          p_action: string
          p_after: Json
          p_entity: string
          p_entity_id: string
          p_reason: string
        }
        Returns: undefined
      }
      _notify_roles: {
        Args: {
          p_body: string
          p_link: string
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_title: string
        }
        Returns: undefined
      }
      _notify_user: {
        Args: {
          p_body: string
          p_link: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      _refresh_order_status: { Args: { p_id: string }; Returns: undefined }
      _so_reserved: {
        Args: { p_product: string; p_so: string }
        Returns: number
      }
      _usable_qty: {
        Args: { p_loc: string; p_product: string }
        Returns: number
      }
      adjust_stock: {
        Args: {
          p_batch: string
          p_location: string
          p_qty: number
          p_reason: string
          p_type: string
        }
        Returns: undefined
      }
      admin_update_profile: {
        Args: {
          p_active: boolean
          p_full_name: string
          p_phone: string
          p_territory: string
          p_user: string
        }
        Returns: undefined
      }
      can_view_location: { Args: { _loc: string }; Returns: boolean }
      cancel_expense: { Args: { p_id: string }; Returns: undefined }
      cancel_order: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_requisition: { Args: { p_id: string }; Returns: undefined }
      central_location: { Args: never; Returns: string }
      create_order: {
        Args: {
          p_chemist: string
          p_extra_discount_pct: number
          p_idempotency_key: string
          p_items: Json
          p_remarks: string
          p_so_discount_pct: number
        }
        Returns: string
      }
      dashboard_summary: {
        Args: { p_from: string; p_so?: string; p_to: string }
        Returns: Json
      }
      decide_order: {
        Args: { p_approve: boolean; p_id: string; p_note: string }
        Returns: undefined
      }
      decide_requisition: {
        Args: { p_id: string; p_items: Json; p_note: string; p_reject: boolean }
        Returns: undefined
      }
      deliver_order: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_order: string
          p_remarks: string
        }
        Returns: string
      }
      find_party_duplicates: {
        Args: {
          p_exclude?: string
          p_kind: string
          p_mobile: string
          p_name: string
          p_place: string
        }
        Returns: {
          assigned_to: string
          code: string
          id: string
          mobile: string
          name: string
          place: string
          reason: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_opening_stock: { Args: { p_rows: Json }; Returns: number }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      issue_requisition: { Args: { p_id: string }; Returns: undefined }
      my_available_stock: {
        Args: never
        Returns: {
          available: number
          on_hand: number
          product_id: string
          reserved: number
        }[]
      }
      next_doc_no: { Args: { p_prefix: string }; Returns: string }
      receive_requisition: { Args: { p_id: string }; Returns: undefined }
      receive_stock: {
        Args: {
          p_batch_no: string
          p_expiry: string
          p_mfg: string
          p_product: string
          p_qty: number
          p_reference?: string
          p_remarks?: string
          p_type?: string
        }
        Returns: string
      }
      record_collection: {
        Args: {
          p_amount: number
          p_date: string
          p_idempotency_key: string
          p_method: string
          p_order: string
          p_reference: string
          p_remarks: string
        }
        Returns: string
      }
      record_doctor_visit: {
        Args: {
          p_date: string
          p_doctor: string
          p_end: string
          p_idempotency_key: string
          p_items: Json
          p_lat: number
          p_lng: number
          p_notes: string
          p_purpose: string
          p_start: string
        }
        Returns: string
      }
      reverse_collection: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      review_deposit: {
        Args: { p_approve: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      review_expense: {
        Args: { p_approve: boolean; p_id: string; p_note: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          p_grant: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      so_location: { Args: { _so: string }; Returns: string }
      submit_deposit: {
        Args: {
          p_account_ref: string
          p_amount: number
          p_attachment_path: string
          p_date: string
          p_idempotency_key: string
          p_method: string
          p_provider: string
          p_received_by: string
          p_remarks: string
          p_transaction_id: string
        }
        Returns: string
      }
      submit_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_description: string
          p_idempotency_key: string
          p_receipt_paths: string[]
        }
        Returns: string
      }
      submit_requisition: {
        Args: { p_items: Json; p_remarks: string }
        Returns: string
      }
      today_bd: { Args: never; Returns: string }
      transfer_stock: {
        Args: {
          p_batch: string
          p_from: string
          p_qty: number
          p_reason: string
          p_to: string
        }
        Returns: undefined
      }
      wallet_balance: { Args: { p_so: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "finance_admin"
        | "warehouse_admin"
        | "sales_officer"
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
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "finance_admin",
        "warehouse_admin",
        "sales_officer",
      ],
    },
  },
} as const
