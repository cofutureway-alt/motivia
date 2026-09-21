-- Phase 67: Extend existing RPC functions with notification calls

-- 1. Trigger for student points ledger to automatically run Level Up & Leaderboard Top 10 checks
CREATE OR REPLACE FUNCTION public.trg_check_student_gamification_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_student_level_and_rank_notifications(NEW.student_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_points_notifications ON public.points_ledger;
CREATE TRIGGER trg_student_points_notifications
  AFTER INSERT ON public.points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_student_gamification_notifications();

-- 2. Trigger on enrollments to send course purchase notification
CREATE OR REPLACE FUNCTION public.trg_notify_on_enrollment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.courses WHERE id = NEW.course_id;

  PERFORM public.create_notification(
    NEW.user_id,
    'course_purchased',
    'تم تفعيل اشتراكك في الكورس بنجاح',
    'مبروك! تم تسجيلك في كورس: ' || COALESCE(v_title, '') || '. يمكنك البدء بالدراسة فوراً.',
    jsonb_build_object('course_id', NEW.course_id, 'course_title', v_title),
    '/courses/' || NEW.course_id,
    'course',
    NEW.course_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_created_notifications ON public.enrollments;
CREATE TRIGGER trg_enrollment_created_notifications
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_enrollment_created();

-- 3. Trigger on bundle_purchases to send bundle purchase notification
CREATE OR REPLACE FUNCTION public.trg_notify_on_bundle_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.bundles WHERE id = NEW.bundle_id;

  PERFORM public.create_notification(
    NEW.user_id,
    'bundle_purchased',
    'تم تفعيل اشتراكك في الباقة بنجاح',
    'مبروك! تم تفعيل اشتراكك في باقة: ' || COALESCE(v_title, '') || '. تم تفعيل كل الكورسات المندرجة تحت الباقة.',
    jsonb_build_object('bundle_id', NEW.bundle_id, 'bundle_title', v_title),
    '/dashboard',
    'bundle',
    NEW.bundle_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bundle_purchased_notifications ON public.bundle_purchases;
CREATE TRIGGER trg_bundle_purchased_notifications
  AFTER INSERT ON public.bundle_purchases
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_bundle_purchased();

-- 4. Trigger on book_orders INSERT to notify student and all admins
CREATE OR REPLACE FUNCTION public.trg_notify_on_book_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify Student
  PERFORM public.create_notification(
    NEW.user_id,
    'book_order_created',
    'تم تسجيل طلب الكتاب بنجاح',
    'تم استلام طلبك رقم (' || COALESCE(NEW.order_number, '') || ') بنجاح وهو قيد المعالجة.',
    jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number),
    '/dashboard/book-orders',
    'book_order',
    NEW.id
  );

  -- Notify All Admins
  PERFORM public.notify_all_admins(
    'admin_new_book_order',
    'طلب كتاب جديد يتطلب المراجعة',
    'تم تقديم طلب كتاب جديد رقم (' || COALESCE(NEW.order_number, '') || ') بقيمة ' || (NEW.total_amount_piastres/100)::text || ' ج.م.',
    jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number),
    '/admin/book-orders',
    'book_order',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_order_created_notifications ON public.book_orders;
CREATE TRIGGER trg_book_order_created_notifications
  AFTER INSERT ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_book_order_created();

-- 5. Trigger on book_orders status changes to notify student
CREATE OR REPLACE FUNCTION public.trg_notify_on_book_order_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_ar text;
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status AND NEW.order_status IN ('confirmed', 'shipped', 'delivered', 'delivery_failed') THEN
    CASE NEW.order_status
      WHEN 'confirmed' THEN v_status_ar := 'مؤكد وقيد التجهيز';
      WHEN 'shipped' THEN v_status_ar := 'تم الشحن وهو في الطريق إليك';
      WHEN 'delivered' THEN v_status_ar := 'تم التسليم بنجاح';
      WHEN 'delivery_failed' THEN v_status_ar := 'تعذّر التسليم';
      ELSE v_status_ar := NEW.order_status;
    END CASE;

    PERFORM public.create_notification(
      NEW.user_id,
      'book_order_status_changed',
      'تحديث بشأن طلب الكتاب رقم ' || COALESCE(NEW.order_number, ''),
      'تغيرت حالة طلبك إلى: ' || v_status_ar || '.',
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number, 'status', NEW.order_status),
      '/dashboard/book-orders',
      'book_order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_order_status_notifications ON public.book_orders;
CREATE TRIGGER trg_book_order_status_notifications
  AFTER UPDATE ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_book_order_status_changed();

-- 6. Trigger on wallet balance adjustment to notify student
CREATE OR REPLACE FUNCTION public.trg_notify_on_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type IN ('credit', 'debit', 'admin_adjustment', 'topup_card', 'refund') THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'wallet_transaction',
      'تحديث في رصيد محفظتك',
      'تم إجراء معاملة على محفظتك بقيمة ' || (NEW.amount_piastres/100)::text || ' ج.م.',
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount_piastres, 'type', NEW.transaction_type),
      '/dashboard/wallet',
      'wallet_transaction',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_transaction_notifications ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_transaction_notifications
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_wallet_transaction();

-- 7. Trigger on manual payment transactions to notify admins (submission) and student (rejection)
CREATE OR REPLACE FUNCTION public.trg_notify_on_payment_transaction_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_support_phone text := '01000000000';
BEGIN
  -- Event A: Admin notification when manual payment proof submitted
  IF (OLD IS NULL OR OLD.status <> 'pending') AND NEW.status = 'pending' AND NEW.proof_file_url IS NOT NULL THEN
    PERFORM public.notify_all_admins(
      'admin_payment_proof_submitted',
      'إثبات دفع يدوي جديد يتطلب المراجعة',
      'تم إرسال إثبات دفع جديد بقيمة ' || (NEW.amount_piastres/100)::text || ' ج.م. في انتظار مراجعة الأدمن.',
      jsonb_build_object('txn_id', NEW.id, 'reference_number', NEW.reference_number),
      '/admin/payment-requests',
      'payment_transaction',
      NEW.id
    );
  END IF;

  -- Event B: Student notification when manual payment proof rejected
  IF (OLD IS NULL OR OLD.status <> 'failed') AND NEW.status = 'failed' AND NEW.failure_reason IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'payment_proof_rejected',
      'تم رفض إثبات الدفع اليدوي',
      'تعذّر قبول إثبات الدفع اليدوي (' || COALESCE(NEW.failure_reason, 'بيانات غير مطابقة') || '). تواصل مع الدعم الفني: ' || v_support_phone,
      jsonb_build_object('txn_id', NEW.id, 'reference_number', NEW.reference_number, 'support_phone', v_support_phone),
      '/dashboard/wallet',
      'payment_transaction',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_transaction_notifications ON public.payment_transactions;
CREATE TRIGGER trg_payment_transaction_notifications
  AFTER UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_payment_transaction_events();

-- 8. Trigger on book_order_refund_requests to notify admins (on create) and student (on status change)
CREATE OR REPLACE FUNCTION public.trg_notify_on_refund_request_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_ar text;
BEGIN
  -- Event A: Admin notification on new refund request
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_all_admins(
      'admin_refund_request',
      'طلب استرجاع جديد يتطلب المراجعة',
      'تم تقديم طلب استرجاع جديد يتطلب المراجعة من الأدمن.',
      jsonb_build_object('request_id', NEW.id),
      '/admin/refund-requests',
      'refund_request',
      NEW.id
    );
    RETURN NEW;
  END IF;

  -- Event B: Student notification when refund status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'approved' THEN v_status_ar := 'مقبول وقيد المعالجة';
      WHEN 'completed' THEN v_status_ar := 'مكتمل وتم إرجاع المبلغ';
      WHEN 'rejected' THEN v_status_ar := 'مرفوض';
      ELSE v_status_ar := NEW.status;
    END CASE;

    PERFORM public.create_notification(
      NEW.user_id,
      'refund_status_changed',
      'تحديث بشأن طلب الاسترجاع',
      'تغيرت حالة طلب الاسترجاع الخاص بك إلى: ' || v_status_ar || '.',
      jsonb_build_object('request_id', NEW.id, 'status', NEW.status),
      '/dashboard/wallet',
      'refund_request',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_request_notifications ON public.book_order_refund_requests;
CREATE TRIGGER trg_refund_request_notifications
  AFTER INSERT OR UPDATE ON public.book_order_refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_refund_request_events();

-- 9. Trigger on parent_student_links to notify admins on new request
CREATE OR REPLACE FUNCTION public.trg_notify_on_parent_link_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_name text;
BEGIN
  IF (OLD IS NULL OR OLD.status <> 'pending') AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_parent_name FROM public.profiles WHERE id = NEW.parent_user_id;

    PERFORM public.notify_all_admins(
      'admin_parent_link_request',
      'طلب ربط ولي أمر جديد',
      'قام ولي الأمر (' || COALESCE(v_parent_name, 'ولي أمر') || ') بتقديم طلب ربط طالب جديد.',
      jsonb_build_object('link_id', NEW.id, 'parent_id', NEW.parent_user_id, 'student_id', NEW.student_user_id),
      '/admin/parent-link-requests',
      'parent_student_link',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parent_link_request_notifications ON public.parent_student_links;
CREATE TRIGGER trg_parent_link_request_notifications
  AFTER INSERT OR UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_parent_link_request_created();
