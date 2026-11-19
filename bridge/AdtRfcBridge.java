import com.sap.conn.jco.JCo;
import com.sap.conn.jco.JCoContext;
import com.sap.conn.jco.JCoDestination;
import com.sap.conn.jco.JCoDestinationManager;
import com.sap.conn.jco.JCoFunction;
import com.sap.conn.jco.JCoStructure;
import com.sap.conn.jco.JCoTable;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import com.sap.conn.jco.ext.Environment;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Properties;

/**
 * Translates HTTP-style ADT requests into SADT_REST_RFC_ENDPOINT calls.
 * Protocol (stdin/stdout, one line per message, all fields Base64, TAB separated):
 *   in : id, method, uri, headers ("Name: value\n"...), body
 *   out: id, status, reason, headers, body        or   id, "ERR", message
 * Connection parameters come from environment variables (never logged):
 *   JCO_ASHOST, JCO_SYSNR, JCO_CLIENT, JCO_USER, JCO_PASSWD, JCO_LANG
 *   (optional: JCO_GWHOST, JCO_GWSERV)
 * Requests with header X-sap-adt-sessiontype: stateful run inside a JCoContext
 * (one RFC connection kept open); a stateless request ends that context first.
 */
public class AdtRfcBridge {
  private static final String DEST = "ADT_RFC_BRIDGE";
  private static final Base64.Decoder DEC = Base64.getDecoder();
  private static final Base64.Encoder ENC = Base64.getEncoder();

  static class Provider implements DestinationDataProvider {
    private final Properties props;
    Provider(Properties p) { this.props = p; }
    public Properties getDestinationProperties(String name) { return DEST.equals(name) ? props : null; }
    public boolean supportsEvents() { return false; }
    public void setDestinationDataEventListener(DestinationDataEventListener l) { }
  }

  static String env(String k) { String v = System.getenv(k); return v == null ? "" : v; }

  static String b64(String s) { return ENC.encodeToString(s.getBytes(StandardCharsets.UTF_8)); }
  static String str(String b) { return new String(DEC.decode(b), StandardCharsets.UTF_8); }

  public static void main(String[] args) throws Exception {
    // stdout is the protocol channel; keep anything else off it
    PrintStream out = new PrintStream(System.out, true, "UTF-8");
    System.setOut(System.err);

    Properties p = new Properties();
    p.setProperty(DestinationDataProvider.JCO_ASHOST, env("JCO_ASHOST"));
    p.setProperty(DestinationDataProvider.JCO_SYSNR, env("JCO_SYSNR"));
    p.setProperty(DestinationDataProvider.JCO_CLIENT, env("JCO_CLIENT"));
    p.setProperty(DestinationDataProvider.JCO_USER, env("JCO_USER"));
    p.setProperty(DestinationDataProvider.JCO_PASSWD, env("JCO_PASSWD"));
    p.setProperty(DestinationDataProvider.JCO_LANG, env("JCO_LANG").isEmpty() ? "EN" : env("JCO_LANG"));
    if (!env("JCO_GWHOST").isEmpty()) p.setProperty(DestinationDataProvider.JCO_GWHOST, env("JCO_GWHOST"));
    if (!env("JCO_GWSERV").isEmpty()) p.setProperty(DestinationDataProvider.JCO_GWSERV, env("JCO_GWSERV"));
    Environment.registerDestinationDataProvider(new Provider(p));

    JCoDestination dest = JCoDestinationManager.getDestination(DEST);
    boolean inContext = false;

    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = in.readLine()) != null) {
      String[] f = line.split("\t", -1);
      String id = f[0];
      try {
        String method = str(f[1]), uri = str(f[2]), headers = str(f[3]);
        byte[] body = DEC.decode(f[4]);

        boolean stateful = false;
        StringBuilder hdr = new StringBuilder();
        for (String h : headers.split("\n")) {
          int i = h.indexOf(':');
          if (i <= 0) continue;
          String name = h.substring(0, i).trim(), value = h.substring(i + 1).trim();
          String lower = name.toLowerCase();
          if (lower.equals("x-sap-adt-sessiontype")) stateful = value.equalsIgnoreCase("stateful");
          // RFC logon replaces HTTP auth/session cookies
          if (lower.equals("authorization") || lower.equals("cookie")) continue;
          hdr.append(name).append('\n').append(value).append('\n');
        }

        if (stateful && !inContext) { JCoContext.begin(dest); inContext = true; }
        if (!stateful && inContext) { JCoContext.end(dest); inContext = false; }

        JCoFunction fn = dest.getRepository().getFunction("SADT_REST_RFC_ENDPOINT");
        if (fn == null) throw new IllegalStateException("SADT_REST_RFC_ENDPOINT not found");
        JCoStructure req = fn.getImportParameterList().getStructure("REQUEST");
        JCoStructure rl = req.getStructure("REQUEST_LINE");
        rl.setValue("METHOD", method);
        rl.setValue("URI", uri);
        rl.setValue("VERSION", "HTTP/1.1");
        if (hdr.length() > 0) {
          JCoTable ht = req.getTable("HEADER_FIELDS");
          String[] kv = hdr.toString().split("\n");
          for (int i = 0; i + 1 < kv.length; i += 2) {
            ht.appendRow();
            ht.setValue("NAME", kv[i]);
            ht.setValue("VALUE", kv[i + 1]);
          }
        }
        req.setValue("MESSAGE_BODY", body);

        fn.execute(dest);

        JCoStructure resp = fn.getExportParameterList().getStructure("RESPONSE");
        JCoStructure sl = resp.getStructure("STATUS_LINE");
        String status = sl.getString("STATUS_CODE").trim();
        String reason = sl.getString("REASON_PHRASE");
        StringBuilder rh = new StringBuilder();
        JCoTable rt = resp.getTable("HEADER_FIELDS");
        for (int i = 0; i < rt.getNumRows(); i++) {
          rt.setRow(i);
          rh.append(rt.getString("NAME")).append(": ").append(rt.getString("VALUE")).append('\n');
        }
        byte[] rb = resp.getByteArray("MESSAGE_BODY");
        out.println(id + "\t" + status + "\t" + b64(reason) + "\t" + b64(rh.toString()) + "\t"
            + ENC.encodeToString(rb == null ? new byte[0] : rb));
      } catch (Throwable t) {
        String m = t.getClass().getSimpleName() + ": " + t.getMessage();
        out.println(id + "\tERR\t" + b64(m));
      }
    }
    if (inContext) JCoContext.end(dest);
  }
}
