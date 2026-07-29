import re
import json
from datetime import datetime
from typing import Optional, Any, Dict, Set

class ValidationEngine:
    @staticmethod
    def validate_value(
        value: Any,
        validation_type: str,
        parameters_str: Optional[str] = None,
        error_message: Optional[str] = None,
        seen_values: Optional[Set[str]] = None,  # For Unique check
        severity: str = "Error"
    ) -> Dict[str, Any]:
        """
        Validates a transformed value against a validation rule.
        Returns:
            dict with:
                "valid": bool
                "status": "Valid" | "Warning" | "Error"
                "message": str or None
        """
        # Default success response
        success_res = {"valid": True, "status": "Valid", "message": None}

        params = {}
        if parameters_str:
            try:
                params = json.loads(parameters_str)
            except Exception:
                pass

        val_str = "" if value is None else str(value).strip()
        val_type_lower = validation_type.strip().lower()

        # Helper to generate the failure response
        def fail(msg: str) -> Dict[str, Any]:
            final_msg = error_message if error_message else msg
            return {
                "valid": False,
                "status": severity if severity in ["Error", "Warning", "Info"] else "Error",
                "message": final_msg
            }

        try:
            # 1. Required / Not Null
            if val_type_lower in ["required", "not null"]:
                if val_str == "":
                    return fail("This field is required.")

            # Skip other checks if the value is empty (optional fields)
            if val_str == "" and val_type_lower not in ["required", "not null"]:
                return success_res

            # 2. Minimum Length
            elif val_type_lower == "minimum length":
                min_len = int(params.get("min_length", 0))
                if len(val_str) < min_len:
                    return fail(f"Value length is too short (minimum is {min_len} characters).")

            # 3. Maximum Length
            elif val_type_lower == "maximum length":
                max_len = int(params.get("max_length", 0))
                if len(val_str) > max_len:
                    return fail(f"Value length exceeds limit (maximum is {max_len} characters).")

            # 4. Email
            elif val_type_lower == "email":
                email_regex = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-.]+$"
                if not re.match(email_regex, val_str):
                    return fail("Invalid email address format.")

            # 5. Phone
            elif val_type_lower == "phone":
                # Simple phone validation matching digits, spaces, dashes, parentheses, plus
                phone_regex = r"^\+?[0-9\s\-()]{7,20}$"
                if not re.match(phone_regex, val_str):
                    return fail("Invalid telephone number format.")

            # 6. Regex
            elif val_type_lower == "regex":
                pattern = params.get("pattern", "")
                if pattern:
                    if not re.match(pattern, val_str):
                        return fail(f"Value does not match validation pattern: '{pattern}'.")

            # 7. Unique
            elif val_type_lower == "unique":
                if seen_values is not None:
                    # Case insensitive uniqueness check
                    norm_val = val_str.lower()
                    if norm_val in seen_values:
                        return fail(f"Value '{val_str}' must be unique.")
                    seen_values.add(norm_val)

            # 8. Allowed Values
            elif val_type_lower == "allowed values":
                allowed = [str(x).strip().lower() for x in params.get("allowed_values", [])]
                if val_str.lower() not in allowed:
                    return fail(f"Value must be one of: {', '.join(params.get('allowed_values', []))}.")

            # 9. Numeric
            elif val_type_lower == "numeric":
                try:
                    float(val_str)
                except ValueError:
                    return fail("Value must be a numeric value.")

            # 10. Date
            elif val_type_lower == "date":
                fmt = params.get("format", "%Y-%m-%d")
                try:
                    datetime.strptime(val_str, fmt)
                except ValueError:
                    return fail(f"Value must be a date matching format '{fmt}'.")

            # 11. Range
            elif val_type_lower == "range":
                try:
                    num_val = float(val_str)
                    min_val = params.get("min")
                    max_val = params.get("max")
                    
                    if min_val is not None and num_val < float(min_val):
                        return fail(f"Value must be at least {min_val}.")
                    if max_val is not None and num_val > float(max_val):
                        return fail(f"Value cannot exceed {max_val}.")
                except ValueError:
                    return fail("Range validation requires a numeric value.")

            # 12. Custom Expression
            elif val_type_lower == "custom expression":
                # Only ever supports a length check like "len(value) > 5" -
                # matched and evaluated directly here instead of via eval().
                # eval() was reachable two ways even with __builtins__
                # stripped: (1) the "__builtins__": None restriction is a
                # well-known incomplete sandbox - object introspection
                # gadgets (e.g. ().__class__.__base__.__subclasses__()) can
                # still reach dangerous functionality without builtins, and
                # (2) val_str (the actual imported data value, not the rule
                # itself) was spliced into the expression as a raw quoted
                # string with no escaping - a single quote in imported data
                # would break out of that string and inject into the eval.
                # A regex match against the one supported shape closes both
                # without needing to execute anything.
                expr = params.get("expression", "")
                match = re.fullmatch(
                    r"\s*len\(\s*value\s*\)\s*(==|!=|>=|<=|>|<)\s*(\d+)\s*",
                    expr
                )
                if match:
                    op, num_str = match.group(1), match.group(2)
                    length = len(val_str)
                    num = int(num_str)
                    ops = {
                        "==": length == num, "!=": length != num,
                        ">=": length >= num, "<=": length <= num,
                        ">": length > num, "<": length < num,
                    }
                    if not ops[op]:
                        return fail("Value fails custom logic constraints.")
                elif "len(" in expr:
                    # Doesn't match the one supported shape - fail closed
                    # (reject the value) rather than silently letting it
                    # through or trying to execute arbitrary text.
                    return fail("Custom validation expression is not in a supported format (expected e.g. \"len(value) > 5\").")

            return success_res

        except Exception as e:
            print(f"Warning: ValidationEngine runtime failure: {e}")
            return success_res
