import { customAlphabet } from "nanoid";

/**
 * 角色编辑密码（12 位）。
 *
 * 管理员把密码交给某位玩家后，该玩家才能通过「改人设」修改这个角色的设定。
 * 字母表刻意去掉了容易看错的 0/O/o/1/l/I，方便口头或手写传递。
 */
const EDIT_PASSWORD_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";

export const EDIT_PASSWORD_LENGTH = 12;

const nanoid = customAlphabet(EDIT_PASSWORD_ALPHABET, EDIT_PASSWORD_LENGTH);

export function generateEditPassword(): string {
  return nanoid();
}
