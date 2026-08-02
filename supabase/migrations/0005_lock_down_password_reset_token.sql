-- The password-reset request now goes through a server function (using the
-- service-role client) that sends the token by e-mail via Resend instead of
-- handing it back to the caller. Direct anon/authenticated access to this RPC
-- would let anyone fetch a valid reset token without ever seeing the e-mail,
-- defeating the point of routing this through real e-mail delivery.
REVOKE EXECUTE ON FUNCTION public.admin_request_password_reset(text) FROM anon, authenticated;
