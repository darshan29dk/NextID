import re
import json
from datetime import datetime
from typing import Optional, Any

class TransformationEngine:
    @staticmethod
    def transform_value(
        value: Any,
        rule_type: str,
        expression: Optional[str] = None,
        parameters_str: Optional[str] = None,
        row_data: Optional[dict] = None
    ) -> Any:
        if value is None:
            value = ""
        else:
            value = str(value)

        params = {}
        if parameters_str:
            try:
                params = json.loads(parameters_str)
            except Exception:
                pass

        if row_data is None:
            row_data = {}

        rule_type_lower = rule_type.strip().lower()

        try:
            if rule_type_lower == "trim":
                return value.strip()

            elif rule_type_lower == "uppercase":
                return value.upper()

            elif rule_type_lower == "lowercase":
                return value.lower()

            elif rule_type_lower == "capitalize":
                # Capitalize first letter of each word
                return value.title()

            elif rule_type_lower == "replace":
                search = params.get("search", "")
                replace = params.get("replace", "")
                return value.replace(search, replace)

            elif rule_type_lower == "regex replace":
                pattern = params.get("pattern", "")
                replace = params.get("replace", "")
                if pattern:
                    return re.sub(pattern, replace, value)
                return value

            elif rule_type_lower == "split":
                delimiter = params.get("delimiter", ",")
                index = int(params.get("index", 0))
                if delimiter == "":
                    delimiter = ","
                parts = value.split(delimiter)
                if 0 <= index < len(parts):
                    return parts[index]
                elif index < 0 and abs(index) <= len(parts):
                    return parts[index]
                return ""

            elif rule_type_lower == "concatenate":
                fields = params.get("fields", [])
                delimiter = params.get("delimiter", " ")
                prefix = params.get("prefix", "")
                suffix = params.get("suffix", "")
                
                parts = []
                for f in fields:
                    parts.append(str(row_data.get(f, "")))
                
                joined = delimiter.join(parts)
                return f"{prefix}{joined}{suffix}"

            elif rule_type_lower == "substring":
                start = int(params.get("start", 0))
                end = params.get("end")
                if end is not None:
                    end = int(end)
                    return value[start:end]
                return value[start:]

            elif rule_type_lower == "date format":
                source_format = params.get("source_format", "%Y-%m-%d")
                target_format = params.get("target_format", "%d/%m/%Y")
                if not value:
                    return ""
                
                # Try common formats if parsing fails with the source format
                dt = None
                formats_to_try = [source_format, "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ"]
                for fmt in formats_to_try:
                    try:
                        dt = datetime.strptime(value.strip(), fmt)
                        break
                    except Exception:
                        continue
                
                if dt:
                    return dt.strftime(target_format)
                return value

            elif rule_type_lower == "number format":
                decimals = int(params.get("decimals", 2))
                try:
                    num_val = float(value.replace(",", ""))
                    return f"{num_val:.{decimals}f}"
                except Exception:
                    return value

            elif rule_type_lower == "default value":
                default = params.get("default", "")
                if value.strip() == "":
                    return default
                return value

            elif rule_type_lower == "lookup":
                lookup_map = params.get("lookup_map", {})
                default = params.get("default")
                # Case-insensitive check
                val_key = value.strip().lower()
                for k, v in lookup_map.items():
                    if str(k).strip().lower() == val_key:
                        return v
                if default is not None:
                    return default
                return value

            elif rule_type_lower == "expression":
                # Safe formatting-based expression
                if expression:
                    # Replace placeholders like {email} with actual values
                    # Safe validation check
                    formatted_expr = expression
                    for k, v in row_data.items():
                        formatted_expr = formatted_expr.replace(f"{{{k}}}", str(v))
                    # Fallback replace for current field value if using {value}
                    formatted_expr = formatted_expr.replace("{value}", value)
                    return formatted_expr
                return value

            else:
                return value

        except Exception as e:
            # Return original value if transformation encounters a runtime error
            print(f"Warning: TransformationEngine failed for rule {rule_type}: {e}")
            return value
